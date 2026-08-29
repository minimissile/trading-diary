import type { InstrumentKind } from '../../shared/market/types';
import type {
  SipAiExtractedRecord,
  SipAiImportInput,
  SipCsvParseResult,
  SipImportCommitResult,
  SipImportInput,
  SipImportPreviewResult,
  SipImportPreviewRow,
} from '../../shared/sip/import-types';
import type { AppDatabase } from '../database/database';
import { marketService } from '../market/market-service';
import { assertRequiredSipMapping, guessSipColumnMapping } from './sip-column-guess';
import { csvBasename, parseCsvFile } from '../import/csv-parser';
import type { SipDatabase } from './sip-database';
import { hasPartialExtractedRecord } from './sip-ai-import-parser';
import { normalizeSipImportRow, normalizeSipImportValues, type NormalizedSipImportRow } from './sip-row-normalizer';

const ALLOWED_SIP_KINDS = new Set(['otc_fund', 'etf', 'lof']);

export class SipImportService {
  constructor(
    private readonly database: AppDatabase,
    private readonly sip: SipDatabase,
  ) {}

  parseCsv(sourcePath: string): SipCsvParseResult {
    const parsed = parseCsvFile(sourcePath);
    return {
      sourcePath,
      fileName: csvBasename(sourcePath),
      headers: parsed.headers,
      rowCount: parsed.rows.length,
      previewRows: parsed.rows.slice(0, 8),
      suggestedMapping: guessSipColumnMapping(parsed.headers),
    };
  }

  preview(input: SipImportInput): SipImportPreviewResult {
    assertRequiredSipMapping(input.mapping);
    const accountId = this.database.portfolio.resolveAccountId(input.accountId);
    const parsed = parseCsvFile(input.sourcePath);

    const rows = parsed.rows.map((row, index) =>
      this.buildPreviewRow(accountId, input.planId, index + 2, () => normalizeSipImportRow(row, input.mapping)),
    );

    return summarizePreview(rows);
  }

  previewRecords(input: SipAiImportInput): SipImportPreviewResult {
    const accountId = this.database.portfolio.resolveAccountId(input.accountId);
    const rows = input.records.map((record) => this.buildPreviewRowFromExtracted(accountId, input.planId, record));
    return summarizePreview(rows);
  }

  async commit(input: SipImportInput): Promise<SipImportCommitResult> {
    assertRequiredSipMapping(input.mapping);
    const accountId = this.database.portfolio.resolveAccountId(input.accountId);
    const parsed = parseCsvFile(input.sourcePath);

    let preFailed = 0;
    const preErrors: Array<{ rowIndex: number; message: string }> = [];
    const normalizedRows: Array<{ index: number; value: NormalizedSipImportRow }> = [];

    for (const { row, index } of parsed.rows.map((item, rowIndex) => ({ row: item, index: rowIndex + 2 }))) {
      const normalized = normalizeSipImportRow(row, input.mapping);
      if (!normalized.ok) {
        preFailed += 1;
        preErrors.push({ rowIndex: index, message: normalized.message });
        continue;
      }
      normalizedRows.push({ index, value: normalized.value });
    }

    normalizedRows.sort((left, right) => left.value.tradeAt.localeCompare(right.value.tradeAt));
    const result = await this.commitNormalizedRows(accountId, input.planId, normalizedRows);
    return {
      ...result,
      failed: result.failed + preFailed,
      errors: [...preErrors, ...result.errors].slice(0, 20),
    };
  }

  async commitRecords(input: SipAiImportInput): Promise<SipImportCommitResult> {
    const accountId = this.database.portfolio.resolveAccountId(input.accountId);

    let preFailed = 0;
    const preErrors: Array<{ rowIndex: number; message: string }> = [];
    const normalizedRows: Array<{ index: number; value: NormalizedSipImportRow }> = [];

    for (const record of input.records) {
      const normalized = normalizeExtractedRecord(record);
      if (!normalized.ok) {
        preFailed += 1;
        preErrors.push({ rowIndex: record.rowIndex, message: normalized.message });
        continue;
      }
      normalizedRows.push({ index: record.rowIndex, value: normalized.value });
    }

    normalizedRows.sort((left, right) => left.value.tradeAt.localeCompare(right.value.tradeAt));
    const result = await this.commitNormalizedRows(accountId, input.planId, normalizedRows);
    return {
      ...result,
      failed: result.failed + preFailed,
      errors: [...preErrors, ...result.errors].slice(0, 20),
    };
  }

  private buildPreviewRowFromExtracted(
    accountId: string,
    planId: string | undefined,
    record: SipAiExtractedRecord,
  ): SipImportPreviewRow {
    const normalized = normalizeExtractedRecord(record);
    const displayFields = {
      symbol: record.symbol,
      tradeAt: record.tradeAt,
      nav: record.nav,
      amount: record.amount,
      quantity: record.quantity,
      fees: record.fees,
    };

    if (!normalized.ok) {
      if (hasPartialExtractedRecord(record)) {
        return {
          rowIndex: record.rowIndex,
          status: 'incomplete',
          message: `待补全：${normalized.message}`,
          symbol: displayFields.symbol,
          tradeAt: displayFields.tradeAt,
          nav: displayFields.nav,
          amount: displayFields.amount,
          quantity: displayFields.quantity,
          fees: displayFields.fees,
          matchedPlanName: null,
        };
      }

      return {
        rowIndex: record.rowIndex,
        status: 'error',
        message: normalized.message,
        symbol: null,
        tradeAt: null,
        nav: null,
        amount: null,
        quantity: null,
        fees: null,
        matchedPlanName: null,
      };
    }

    return this.buildPreviewRow(accountId, planId, record.rowIndex, () => normalized);
  }

  private buildPreviewRow(
    accountId: string,
    planId: string | undefined,
    rowIndex: number,
    normalize: () => ReturnType<typeof normalizeSipImportRow>,
  ): SipImportPreviewRow {
    const normalized = normalize();
    if (!normalized.ok) {
      return {
        rowIndex,
        status: 'error',
        message: normalized.message,
        symbol: null,
        tradeAt: null,
        nav: null,
        amount: null,
        quantity: null,
        fees: null,
        matchedPlanName: null,
      };
    }

    const { value } = normalized;
    if (
      this.database.portfolio.hasSimilarSipImport(
        accountId,
        value.symbol,
        value.tradeAt,
        value.quantity,
        value.nav,
      )
    ) {
      return {
        rowIndex,
        status: 'duplicate',
        message: '已存在相同定投流水',
        symbol: value.symbol,
        tradeAt: value.tradeAt,
        nav: value.nav,
        amount: value.amount,
        quantity: value.quantity,
        fees: value.fees,
        matchedPlanName: null,
      };
    }

    const plan = this.sip.findPlanForImport(accountId, value.symbol, planId);
    return {
      rowIndex,
      status: 'ready',
      message: plan ? null : '未匹配计划，将仅写入持仓流水',
      symbol: value.symbol,
      tradeAt: value.tradeAt,
      nav: value.nav,
      amount: value.amount,
      quantity: value.quantity,
      fees: value.fees,
      matchedPlanName: plan?.name ?? null,
    };
  }

  private async commitNormalizedRows(
    accountId: string,
    planId: string | undefined,
    normalizedRows: Array<{ index: number; value: NormalizedSipImportRow }>,
  ): Promise<SipImportCommitResult> {
    let imported = 0;
    let skippedDuplicate = 0;
    let failed = 0;
    let linkedToPlan = 0;
    let ledgerOnly = 0;
    const errors: Array<{ rowIndex: number; message: string }> = [];

    for (const { index, value } of normalizedRows) {
      if (
        this.database.portfolio.hasSimilarSipImport(
          accountId,
          value.symbol,
          value.tradeAt,
          value.quantity,
          value.nav,
        )
      ) {
        skippedDuplicate += 1;
        continue;
      }

      try {
        const instrument = await marketService.resolve(value.symbol);
        if (!ALLOWED_SIP_KINDS.has(instrument.kind)) {
          throw new Error('定投仅支持场外基金、ETF 与 LOF');
        }

        const plan = this.sip.findPlanForImport(accountId, value.symbol, planId);
        const note = plan ? `定投 · ${plan.name}` : `定投导入 · ${instrument.name}`;

        const ledger = this.database.portfolio.addLedgerEntry({
          accountId,
          symbol: value.symbol,
          kind: instrument.kind as InstrumentKind,
          side: 'buy',
          quantity: value.quantity,
          price: value.nav,
          fees: value.fees,
          tradeAt: value.tradeAt,
          note,
          source: 'sip',
        });

        if (plan) {
          this.sip.importCompletedOccurrence(plan.id, value.scheduledDate, {
            amount: value.amount,
            quantity: value.quantity,
            nav: value.nav,
            fees: value.fees,
            ledgerEntryId: ledger.id,
            confirmedAt: value.tradeAt,
          });
          linkedToPlan += 1;
        } else {
          ledgerOnly += 1;
        }

        imported += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : '导入失败';
        if (message.includes('已导入') || message.includes('相同')) {
          skippedDuplicate += 1;
        } else {
          failed += 1;
          errors.push({ rowIndex: index, message });
        }
      }
    }

    return {
      imported,
      skippedDuplicate,
      failed,
      linkedToPlan,
      ledgerOnly,
      errors: errors.slice(0, 20),
    };
  }
}

function normalizeExtractedRecord(
  record: SipAiExtractedRecord,
): ReturnType<typeof normalizeSipImportValues> {
  return normalizeSipImportValues({
    symbol: record.symbol,
    tradeAt: record.tradeAt,
    nav: record.nav,
    amount: record.amount,
    quantity: record.quantity,
    fees: record.fees,
  });
}

function summarizePreview(rows: SipImportPreviewRow[]): SipImportPreviewResult {
  return {
    rows: rows.slice(0, 200),
    readyCount: rows.filter((row) => row.status === 'ready').length,
    duplicateCount: rows.filter((row) => row.status === 'duplicate').length,
    errorCount: rows.filter((row) => row.status === 'error').length,
    incompleteCount: rows.filter((row) => row.status === 'incomplete').length,
  };
}

export function createSipImportService(database: AppDatabase): SipImportService {
  return new SipImportService(database, database.sip);
}
