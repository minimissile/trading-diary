import path from 'node:path';
import { PROMPT_IDS } from '../../shared/llm/prompt-id';
import {
  LEDGER_IMPORT_ASSET_KIND_LABELS,
  importAssetKindToTradeChannel,
  type LedgerAiImportAssetKind,
  type LedgerAiImportInput,
  type LedgerAiImportPreviewResult,
  type LedgerAiRecognizeResult,
  type LedgerImportCommitResult,
} from '../../shared/portfolio/ledger-import-types';
import type { LlmRunner } from '../llm/llm-runner';
import type { SipImportService } from '../sip/sip-import-service';
import {
  buildLedgerAiEmptyRecordsError,
  mergeLedgerExtractedRecords,
  parseLedgerAiImportResponse,
} from './ledger-ai-import-parser';
import { enrichLedgerExtractedRecords } from './ledger-import-enrichment';
import { resolveImportTradeChannel } from './ledger-import-instrument';
import { createLedgerImportService, LedgerImportService, toSipExtractedRecord } from './ledger-import-service';
import type { AppDatabase } from '../database/database';
import type { PortfolioService } from './portfolio-service';

function basename(sourcePath: string): string {
  return path.basename(sourcePath);
}

const FUND_IMPORT_RULES = `- 优先识别「记录详情 / 确认信息」：确认金额、确认份额、确认净值、手续费、确认时间
- tradeDate / purchaseTime：买入申请时间；confirmDate：份额确认日（通常 T+1）
- confirmAmount：扣费后净额；unitNav：确认净值；confirmShares：确认份额
- 有确认区块时务必填满上述字段，不要用申请金额去除以错误净值`;

const STOCK_IMPORT_RULES = `- 识别成交时间、成交价、成交数量（场内 ETF/LOF 与股票相同，数量为整数）
- 价格为场内成交价，不要使用基金净值`;

const FUND_IMPORT_EXAMPLE = `{
  "screenshotType": "trade_history",
  "planMode": "unknown",
  "planModeLabel": null,
  "planHints": null,
  "records": [{
    "symbol": "161226",
    "instrumentName": "国投瑞银白银期货(LOF)A",
    "side": "buy",
    "tradeDate": "2026-01-19",
    "purchaseTime": "2026-01-19 14:39:54",
    "confirmDate": "2026-01-20",
    "amount": 100,
    "confirmAmount": 99.9,
    "unitNav": 2.512,
    "confirmShares": 39.77,
    "fees": 0.1,
    "rawType": "买入",
    "recordKind": "trade"
  }],
  "warnings": []
}`;

const STOCK_IMPORT_EXAMPLE = `{
  "screenshotType": "trade_history",
  "planMode": "unknown",
  "planModeLabel": null,
  "planHints": null,
  "records": [{
    "symbol": "000158",
    "instrumentName": "常山北明",
    "side": "buy",
    "tradeDate": "2024-03-15",
    "price": 8.52,
    "quantity": 1000,
    "amount": 8520,
    "fees": 5,
    "rawType": "买入",
    "recordKind": "trade"
  }],
  "warnings": []
}`;

function buildPromptVariables(importAssetKind: LedgerAiImportAssetKind): Record<string, string> {
  const isFund = importAssetKind === 'fund';
  return {
    importAssetKindLabel: LEDGER_IMPORT_ASSET_KIND_LABELS[importAssetKind],
    importAssetKindRules: isFund ? FUND_IMPORT_RULES : STOCK_IMPORT_RULES,
    importAssetKindExample: isFund ? FUND_IMPORT_EXAMPLE : STOCK_IMPORT_EXAMPLE,
  };
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

  async recognizeScreenshots(
    sourcePaths: string[],
    importAssetKind: LedgerAiImportAssetKind = 'stock',
  ): Promise<LedgerAiRecognizeResult> {
    if (sourcePaths.length === 0) {
      throw new Error('请至少选择一张截图');
    }

    const promptVariables = buildPromptVariables(importAssetKind);
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
      const result = await this.llmRunner.runVision(
        PROMPT_IDS.PORTFOLIO_LEDGER_IMPORT_SCREENSHOT,
        promptVariables,
        sourcePath,
      );
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

    return {
      sourcePaths,
      fileNames: sourcePaths.map(basename),
      records: merged,
      warnings: allWarnings,
      enrichments: [],
      importAssetKind,
      tradeChannel: importAssetKindToTradeChannel(importAssetKind),
      tradeChannelLabel: null,
      sipPlanMode: planMode,
      sipPlanModeLabel: planModeLabel,
      sipPlanHints: planHints,
      model: lastModel,
    };
  }

  async preview(input: LedgerAiImportInput): Promise<LedgerAiImportPreviewResult> {
    const importAssetKind = input.importAssetKind ?? 'stock';
    const defaultTradeChannel = resolveImportTradeChannel(input);
    const enriched = await enrichLedgerExtractedRecords(input.records, {
      importAssetKind,
      recalculateDerivedFields: true,
    });
    return {
      preview: await this.ledgerImportService.previewRecordsAsync({
        ...input,
        importAssetKind,
        defaultTradeChannel,
        records: enriched.records,
      }),
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
