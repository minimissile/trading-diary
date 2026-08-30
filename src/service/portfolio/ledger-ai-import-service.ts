import path from 'node:path';
import { PROMPT_IDS } from '../../shared/llm/prompt-id';
import type {
  LedgerAiImportInput,
  LedgerAiImportPreviewResult,
  LedgerAiRecognizeResult,
  LedgerImportCommitResult,
} from '../../shared/portfolio/ledger-import-types';
import type { LlmRunner } from '../llm/llm-runner';
import type { SipImportService } from '../sip/sip-import-service';
import {
  buildLedgerAiEmptyRecordsError,
  mergeLedgerExtractedRecords,
  parseLedgerAiImportResponse,
} from './ledger-ai-import-parser';
import { enrichLedgerExtractedRecords } from './ledger-import-enrichment';
import { createLedgerImportService, LedgerImportService, toSipExtractedRecord } from './ledger-import-service';
import type { AppDatabase } from '../database/database';
import type { PortfolioService } from './portfolio-service';

function basename(sourcePath: string): string {
  return path.basename(sourcePath);
}

/** 持仓 AI 截图识别与导入编排。 */
export class LedgerAiImportService {
  private readonly ledgerImportService: LedgerImportService;

  constructor(
    private readonly database: AppDatabase,
    private readonly portfolioService: PortfolioService,
    private readonly sipImportService: SipImportService,
    private readonly llmRunner: LlmRunner,
  ) {
    this.ledgerImportService = createLedgerImportService(database, portfolioService);
  }

  async recognizeScreenshots(sourcePaths: string[]): Promise<LedgerAiRecognizeResult> {
    if (sourcePaths.length === 0) {
      throw new Error('请至少选择一张截图');
    }

    const allRecords: ReturnType<typeof parseLedgerAiImportResponse>['records'] = [];
    const allWarnings: string[] = [];
    let planMode: LedgerAiRecognizeResult['sipPlanMode'] = 'unknown';
    let planModeLabel: string | null = null;
    let planHints: LedgerAiRecognizeResult['sipPlanHints'] = null;
    let screenshotType: ReturnType<typeof parseLedgerAiImportResponse>['screenshotType'] = 'unknown';
    let lastModel = 'unknown';

    for (let index = 0; index < sourcePaths.length; index += 1) {
      const sourcePath = sourcePaths[index]!;
      const fileName = basename(sourcePath);
      const result = await this.llmRunner.runVision(PROMPT_IDS.PORTFOLIO_LEDGER_IMPORT_SCREENSHOT, {}, sourcePath);
      lastModel = result.model;
      const parsed = parseLedgerAiImportResponse(result.content, index, fileName);
      allRecords.push(...parsed.records);
      allWarnings.push(...parsed.warnings.map((warning) => `[${fileName}] ${warning}`));
      if (parsed.planMode !== 'unknown') planMode = parsed.planMode;
      if (parsed.planModeLabel) planModeLabel = parsed.planModeLabel;
      if (parsed.planHints) planHints = parsed.planHints;
      if (parsed.screenshotType !== 'unknown') screenshotType = parsed.screenshotType;
    }

    const merged = mergeLedgerExtractedRecords(allRecords);
    const importable = merged.filter(
      (record) => record.recordKind === 'trade' || record.recordKind === 'sip_deduction',
    );

    if (importable.length === 0) {
      throw new Error(
        buildLedgerAiEmptyRecordsError({
          warnings: allWarnings,
          screenshotType,
        }),
      );
    }

    const enriched = await enrichLedgerExtractedRecords(merged);

    return {
      sourcePaths,
      fileNames: sourcePaths.map(basename),
      records: enriched.records,
      warnings: allWarnings,
      enrichments: enriched.enrichments,
      sipPlanMode: planMode,
      sipPlanModeLabel: planModeLabel,
      sipPlanHints: planHints,
      model: lastModel,
    };
  }

  async preview(input: LedgerAiImportInput): Promise<LedgerAiImportPreviewResult> {
    const enriched = await enrichLedgerExtractedRecords(input.records);
    return {
      preview: await this.ledgerImportService.previewRecordsAsync({ ...input, records: enriched.records }),
      records: enriched.records,
      enrichments: enriched.enrichments,
    };
  }

  async commit(input: LedgerAiImportInput): Promise<LedgerImportCommitResult> {
    const tradeResult = await this.ledgerImportService.commitTradeRecords(input);

    if (!input.importSipDeductions) {
      const sipCount = input.records.filter((record) => record.recordKind === 'sip_deduction').length;
      return {
        ...tradeResult,
        skipped: tradeResult.skipped + sipCount,
      };
    }

    const sipRecords = input.records
      .filter((record) => record.recordKind === 'sip_deduction')
      .map(toSipExtractedRecord);

    if (sipRecords.length === 0) {
      return tradeResult;
    }

    const sipResult = await this.sipImportService.commitRecords({
      accountId: input.accountId,
      records: sipRecords,
      planHints: input.sipPlanHints,
    });

    return {
      imported: tradeResult.imported,
      skippedDuplicate: tradeResult.skippedDuplicate + sipResult.skippedDuplicate,
      skipped: tradeResult.skipped,
      failed: tradeResult.failed + sipResult.failed,
      sipImported: sipResult.imported,
      sipSkippedDuplicate: sipResult.skippedDuplicate,
      sipPlansCreated: sipResult.plansCreated,
      errors: [...tradeResult.errors, ...sipResult.errors].slice(0, 20),
    };
  }
}

export function createLedgerAiImportService(
  database: AppDatabase,
  portfolioService: PortfolioService,
  sipImportService: SipImportService,
  llmRunner: LlmRunner,
): LedgerAiImportService {
  return new LedgerAiImportService(database, portfolioService, sipImportService, llmRunner);
}
