import path from 'node:path';
import { PROMPT_IDS } from '../../shared/llm/prompt-id';
import { buildSipAiImportHints } from '../../shared/sip/import-hints';
import type {
  SipAiImportInput,
  SipAiRecognizeResult,
  SipImportCommitResult,
  SipImportPreviewResult,
} from '../../shared/sip/import-types';
import type { LlmRunner } from '../llm/llm-runner';
import { buildSipAiEmptyRecordsError, parseSipAiImportResponse } from './sip-ai-import-parser';
import type { SipImportService } from './sip-import-service';

function csvBasename(sourcePath: string): string {
  return path.basename(sourcePath);
}

/** AI 截图识别与导入编排。 */
export class SipAiImportService {
  constructor(
    private readonly importService: SipImportService,
    private readonly llmRunner: LlmRunner,
  ) {}

  async recognizeScreenshot(sourcePath: string): Promise<SipAiRecognizeResult> {
    const result = await this.llmRunner.runVision(PROMPT_IDS.SIP_IMPORT_SCREENSHOT, {}, sourcePath);
    const parsed = parseSipAiImportResponse(result.content);

    if (parsed.records.length === 0) {
      throw new Error(
        buildSipAiEmptyRecordsError({
          warnings: parsed.warnings,
          planModeLabel: parsed.planModeLabel,
          screenshotType: parsed.screenshotType,
        }),
      );
    }

    return {
      sourcePath,
      fileName: csvBasename(sourcePath),
      records: parsed.records,
      warnings: parsed.warnings,
      planMode: parsed.planMode,
      planModeLabel: parsed.planModeLabel,
      planHints: parsed.planHints,
      hints: buildSipAiImportHints({
        planMode: parsed.planMode,
        planModeLabel: parsed.planModeLabel,
        readyCount: parsed.records.length,
      }),
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
