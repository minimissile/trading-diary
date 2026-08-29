import path from 'node:path';
import { z } from 'zod';
import { PROMPT_IDS } from '../../shared/llm/prompt-id';
import type {
  SipAiExtractedRecord,
  SipAiImportInput,
  SipAiRecognizeResult,
  SipImportCommitResult,
  SipImportPreviewResult,
} from '../../shared/sip/import-types';
import type { LlmRunner } from '../llm/llm-runner';
import type { SipImportService } from './sip-import-service';

const aiResponseSchema = z.object({
  records: z.array(
    z
      .object({
        symbol: z.union([z.string(), z.number(), z.null()]).optional(),
        fundName: z.union([z.string(), z.null()]).optional(),
        tradeDate: z.union([z.string(), z.null()]).optional(),
        nav: z.union([z.number(), z.string(), z.null()]).optional(),
        amount: z.union([z.number(), z.string(), z.null()]).optional(),
        quantity: z.union([z.number(), z.string(), z.null()]).optional(),
        fees: z.union([z.number(), z.string(), z.null()]).optional(),
      })
      .passthrough(),
  ),
  warnings: z.array(z.string()).optional(),
});

function csvBasename(sourcePath: string): string {
  return path.basename(sourcePath);
}

function coerceNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function coerceNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[,，\s￥¥元]/gu, '').trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAiRecords(payload: unknown): { records: SipAiExtractedRecord[]; warnings: string[] } {
  const parsed = aiResponseSchema.parse(payload);
  const records = parsed.records.map((record, index) => ({
    rowIndex: index + 1,
    symbol: coerceNullableString(record.symbol),
    fundName: coerceNullableString(record.fundName),
    tradeAt: coerceNullableString(record.tradeDate),
    nav: coerceNullableNumber(record.nav),
    amount: coerceNullableNumber(record.amount),
    quantity: coerceNullableNumber(record.quantity),
    fees: coerceNullableNumber(record.fees),
  }));
  return { records, warnings: parsed.warnings ?? [] };
}

/** AI 截图识别与导入编排。 */
export class SipAiImportService {
  constructor(
    private readonly importService: SipImportService,
    private readonly llmRunner: LlmRunner,
  ) {}

  async recognizeScreenshot(sourcePath: string): Promise<SipAiRecognizeResult> {
    const result = await this.llmRunner.runVision(PROMPT_IDS.SIP_IMPORT_SCREENSHOT, {}, sourcePath);
    let payload: unknown;
    try {
      payload = JSON.parse(result.content);
    } catch {
      throw new Error('AI 返回内容无法解析为 JSON，请换一张更清晰的截图重试');
    }

    const { records, warnings } = parseAiRecords(payload);
    if (records.length === 0) {
      throw new Error('未从截图中识别到定投扣款记录，请确认截图包含扣款明细');
    }

    return {
      sourcePath,
      fileName: csvBasename(sourcePath),
      records,
      warnings,
      model: result.model,
    };
  }

  preview(input: SipAiImportInput): SipImportPreviewResult {
    return this.importService.previewRecords(input);
  }

  commit(input: SipAiImportInput): Promise<SipImportCommitResult> {
    return this.importService.commitRecords(input);
  }
}

export function createSipAiImportService(importService: SipImportService, llmRunner: LlmRunner): SipAiImportService {
  return new SipAiImportService(importService, llmRunner);
}
