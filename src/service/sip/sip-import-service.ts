import type { InstrumentKind } from '../../shared/market/types';
import type {
  SipAiExtractedRecord,
  SipAiImportInput,
  SipAiPlanHints,
  SipCsvParseResult,
  SipImportCommitResult,
  SipImportInput,
  SipImportPreviewResult,
  SipImportPreviewRow,
} from '../../shared/sip/import-types';
import type { FundSipPlan } from '../../shared/sip/types';
import type { AppDatabase } from '../database/database';
import { marketService } from '../market/market-service';
import { assertRequiredSipMapping, guessSipColumnMapping } from './sip-column-guess';
import { csvBasename, parseCsvFile } from '../import/csv-parser';
import type { SipDatabase } from './sip-database';
import { hasPartialExtractedRecord } from './sip-ai-import-parser';
import { inferSipPlanInputFromImport } from './sip-import-plan-inference';
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

  async previewRecordsAsync(input: SipAiImportInput): Promise<SipImportPreviewResult> {
    const accountId = this.database.portfolio.resolveAccountId(input.accountId);
    const rows = await Promise.all(
      input.records.map((record) => this.buildPreviewRowFromExtractedAsync(accountId, input.planId, record)),
    );
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
    const result = await this.commitNormalizedRows(accountId, input.planId, normalizedRows, input.planHints);
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

  private async buildPreviewRowFromExtractedAsync(
    accountId: string,
    planId: string | undefined,
    record: SipAiExtractedRecord,
  ): Promise<SipImportPreviewRow> {
    const row = this.buildPreviewRowFromExtracted(accountId, planId, record);
    if (row.status !== 'ready' || !row.symbol) return row;

    try {
      const instrument = await marketService.resolve(row.symbol);
      if (!ALLOWED_SIP_KINDS.has(instrument.kind)) {
        return {
          ...row,
          status: 'error',
          message: '定投仅支持场外基金、ETF 与 LOF',
          matchedPlanName: null,
        };
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : '标的解析失败';
      return {
        ...row,
        status: 'error',
        message: `标的代码无法解析：${detail}`,
        matchedPlanName: null,
      };
    }

    return row;
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
    const willAutoCreatePlan = !plan && !planId;
    return {
      rowIndex,
      status: 'ready',
      message: plan ? null : planId ? '指定计划与标的不匹配，将仅写入持仓流水' : '未匹配计划，导入时将自动创建',
      symbol: value.symbol,
      tradeAt: value.tradeAt,
      nav: value.nav,
      amount: value.amount,
      quantity: value.quantity,
      fees: value.fees,
      matchedPlanName: plan?.name ?? (willAutoCreatePlan ? '导入时自动创建' : null),
    };
  }

  private async ensureAutoCreatedPlans(
    accountId: string,
    planId: string | undefined,
    normalizedRows: Array<{ index: number; value: NormalizedSipImportRow }>,
    planHints?: SipAiPlanHints | null,
  ): Promise<{ plans: Map<string, FundSipPlan>; plansCreated: number }> {
    const plans = new Map<string, FundSipPlan>();
    if (planId) return { plans, plansCreated: 0 };

    const rowsBySymbol = new Map<string, NormalizedSipImportRow[]>();
    for (const { value } of normalizedRows) {
      const bucket = rowsBySymbol.get(value.symbol) ?? [];
      bucket.push(value);
      rowsBySymbol.set(value.symbol, bucket);
    }

    let plansCreated = 0;
    for (const [symbol, rows] of rowsBySymbol) {
      if (this.sip.findPlanForImport(accountId, symbol, undefined)) continue;
      try {
        const instrument = await marketService.resolve(symbol);
        if (!ALLOWED_SIP_KINDS.has(instrument.kind)) continue;
        const input = inferSipPlanInputFromImport(rows, planHints);
        const plan = this.sip.createPlan(input, {
          name: instrument.name,
          kind: instrument.kind as InstrumentKind,
          accountId,
        });
        plans.set(symbol, plan);
        plansCreated += 1;
      } catch {
        // 无法推断计划时，后续行仍写入持仓流水
      }
    }

    return { plans, plansCreated };
  }

  private async commitNormalizedRows(
    accountId: string,
    planId: string | undefined,
    normalizedRows: Array<{ index: number; value: NormalizedSipImportRow }>,
    planHints?: SipAiPlanHints | null,
  ): Promise<SipImportCommitResult> {
    let imported = 0;
    let skippedDuplicate = 0;
    let failed = 0;
    let linkedToPlan = 0;
    let ledgerOnly = 0;
    const errors: Array<{ rowIndex: number; message: string }> = [];

    const { plans: autoCreatedPlans, plansCreated } = await this.ensureAutoCreatedPlans(
      accountId,
      planId,
      normalizedRows,
      planHints,
    );

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

        const plan =
          this.sip.findPlanForImport(accountId, value.symbol, planId) ?? autoCreatedPlans.get(value.symbol) ?? null;
        const note = plan ? `定投 · ${plan.name}` : `定投导入 · ${instrument.name}`;

        const ledger = this.database.portfolio.addLedgerEntry({
          accountId,
          symbol: value.symbol,
          kind: instrument.kind as InstrumentKind,
          venue: instrument.kind === 'otc_fund' ? 'OTC' : instrument.venue,
          side: 'buy',
          quantity: value.quantity,
          price: value.nav,
          fees: value.fees,
          tradeAt: value.tradeAt,
          note,
          source: 'sip',
        });

        if (plan) {
          try {
            this.sip.importCompletedOccurrence(plan.id, value.scheduledDate, {
              amount: value.amount,
              quantity: value.quantity,
              nav: value.nav,
              fees: value.fees,
              ledgerEntryId: ledger.id,
              confirmedAt: value.tradeAt,
            });
            linkedToPlan += 1;
          } catch {
            // 流水已写入；期次关联失败时仍保留持仓记录
            ledgerOnly += 1;
          }
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
      plansCreated,
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
