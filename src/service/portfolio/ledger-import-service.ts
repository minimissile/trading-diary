import type {
  LedgerAiExtractedRecord,
  LedgerAiImportInput,
  LedgerImportCommitResult,
  LedgerImportPreviewResult,
  LedgerImportPreviewRow,
} from '../../shared/portfolio/ledger-import-types';
import type { SipAiExtractedRecord } from '../../shared/sip/import-types';
import type { AppDatabase } from '../database/database';
import { marketService } from '../market/market-service';
import { hasPartialLedgerRecord } from './ledger-ai-import-parser';
import { normalizeLedgerTradeRecord, type NormalizedLedgerTradeRow } from './ledger-row-normalizer';
import type { PortfolioService } from './portfolio-service';

/** 持仓流水 AI 导入预览与提交。 */
export class LedgerImportService {
  constructor(
    private readonly database: AppDatabase,
    private readonly portfolioService: PortfolioService,
  ) {}

  previewRecords(input: LedgerAiImportInput): LedgerImportPreviewResult {
    const accountId = this.database.portfolio.resolveAccountId(input.accountId);
    const rows = input.records.map((record) => this.buildPreviewRow(accountId, record));
    return summarizePreview(rows);
  }

  async previewRecordsAsync(input: LedgerAiImportInput): Promise<LedgerImportPreviewResult> {
    const accountId = this.database.portfolio.resolveAccountId(input.accountId);
    const rows = await Promise.all(input.records.map((record) => this.buildPreviewRowAsync(accountId, record)));
    return summarizePreview(rows);
  }

  async commitTradeRecords(input: LedgerAiImportInput): Promise<LedgerImportCommitResult> {
    const accountId = this.database.portfolio.resolveAccountId(input.accountId);
    const tradeRecords = input.records.filter((record) => record.recordKind === 'trade');

    let preFailed = 0;
    const preErrors: Array<{ rowIndex: number; message: string }> = [];
    const normalizedRows: Array<{ index: number; value: NormalizedLedgerTradeRow }> = [];

    for (const record of tradeRecords) {
      const normalized = normalizeLedgerTradeRecord(record);
      if (!normalized.ok) {
        preFailed += 1;
        preErrors.push({ rowIndex: record.rowIndex, message: normalized.message });
        continue;
      }
      normalizedRows.push({ index: record.rowIndex, value: normalized.value });
    }

    normalizedRows.sort((left, right) =>
      left.value.tradeAt.localeCompare(right.value.tradeAt),
    );

    let imported = 0;
    let skippedDuplicate = 0;
    let failed = preFailed;
    const errors = [...preErrors];

    for (const { index, value: row } of normalizedRows) {
      if (
        this.database.portfolio.hasSimilarLedgerImport(
          accountId,
          row.symbol,
          row.tradeAt,
          row.quantity,
          row.price,
          row.side,
        )
      ) {
        skippedDuplicate += 1;
        continue;
      }

      try {
        const instrument = await marketService.resolve(row.symbol);
        await this.portfolioService.addLedgerEntry({
          accountId,
          symbol: instrument.symbol,
          kind: instrument.kind,
          side: row.side,
          quantity: row.quantity,
          price: row.price,
          fees: row.fees,
          tradeAt: row.tradeAt,
          source: 'ai_import',
          note: 'AI识图导入',
        });
        imported += 1;
      } catch (error) {
        failed += 1;
        const detail = error instanceof Error ? error.message : '写入失败';
        errors.push({ rowIndex: index, message: detail });
      }
    }

    return {
      imported,
      skippedDuplicate,
      skipped: 0,
      failed,
      sipImported: 0,
      sipSkippedDuplicate: 0,
      sipPlansCreated: 0,
      errors: errors.slice(0, 20),
    };
  }

  private buildPreviewRow(accountId: string, record: LedgerAiExtractedRecord): LedgerImportPreviewRow {
    const base = toPreviewFields(record);

    if (record.recordKind === 'dividend') {
      return { ...base, status: 'skipped', message: '分红记录已跳过' };
    }
    if (record.recordKind === 'sip_deduction') {
      return { ...base, status: 'skipped', message: '定投扣款（勾选导入定投后处理）' };
    }
    if (record.recordKind !== 'trade') {
      return { ...base, status: 'skipped', message: '无法识别的记录' };
    }

    const normalized = normalizeLedgerTradeRecord(record);
    if (!normalized.ok) {
      if (hasPartialLedgerRecord(record)) {
        return { ...base, status: 'incomplete', message: `待补全：${normalized.message}` };
      }
      return { ...base, status: 'error', message: normalized.message };
    }

    const { value } = normalized;
    if (
      this.database.portfolio.hasSimilarLedgerImport(
        accountId,
        value.symbol,
        value.tradeAt,
        value.quantity,
        value.price,
        value.side,
      )
    ) {
      return { ...base, status: 'duplicate', message: '已存在相同流水', symbol: value.symbol, side: value.side };
    }

    return {
      ...base,
      status: 'ready',
      message: null,
      symbol: value.symbol,
      side: value.side,
      tradeAt: value.tradeAt,
      price: value.price,
      quantity: value.quantity,
      fees: value.fees,
    };
  }

  private async buildPreviewRowAsync(
    accountId: string,
    record: LedgerAiExtractedRecord,
  ): Promise<LedgerImportPreviewRow> {
    const row = this.buildPreviewRow(accountId, record);
    if (row.status !== 'ready' || !row.symbol) return row;

    try {
      await marketService.resolve(row.symbol);
    } catch (error) {
      const detail = error instanceof Error ? error.message : '标的解析失败';
      return { ...row, status: 'error', message: `标的代码无法解析：${detail}` };
    }

    return row;
  }
}

export function toSipExtractedRecord(record: LedgerAiExtractedRecord): SipAiExtractedRecord {
  return {
    rowIndex: record.rowIndex,
    symbol: record.symbol,
    fundName: record.instrumentName,
    tradeAt: record.tradeAt,
    nav: record.price,
    amount: record.amount,
    quantity: record.quantity,
    fees: record.fees,
  };
}

function toPreviewFields(record: LedgerAiExtractedRecord): LedgerImportPreviewRow {
  return {
    rowIndex: record.rowIndex,
    status: 'error',
    message: null,
    recordKind: record.recordKind,
    symbol: record.symbol,
    instrumentName: record.instrumentName,
    side: record.side,
    tradeAt: record.tradeAt,
    price: record.price,
    quantity: record.quantity,
    amount: record.amount,
    fees: record.fees,
  };
}

function summarizePreview(rows: LedgerImportPreviewRow[]): LedgerImportPreviewResult {
  const readyCount = rows.filter((row) => row.status === 'ready').length;
  const duplicateCount = rows.filter((row) => row.status === 'duplicate').length;
  const errorCount = rows.filter((row) => row.status === 'error').length;
  const incompleteCount = rows.filter((row) => row.status === 'incomplete').length;
  const skippedCount = rows.filter((row) => row.status === 'skipped').length;
  const tradeReadyCount = rows.filter((row) => row.status === 'ready' && row.recordKind === 'trade').length;
  const sipReadyCount = rows.filter(
    (row) => row.recordKind === 'sip_deduction' && row.status !== 'error',
  ).length;

  return {
    rows,
    readyCount,
    duplicateCount,
    errorCount,
    incompleteCount,
    skippedCount,
    tradeReadyCount,
    sipReadyCount,
  };
}

export function createLedgerImportService(database: AppDatabase, portfolioService: PortfolioService): LedgerImportService {
  return new LedgerImportService(database, portfolioService);
}
