import { z } from 'zod';
import type { SipRecognizedPlanMode } from '../../shared/sip/import-hints';
import type { SipAiPlanHints } from '../../shared/sip/import-types';
import type {
  LedgerAiExtractedRecord,
  LedgerAiRecordKind,
  LedgerAiTradeSide,
} from '../../shared/portfolio/ledger-import-types';
import { hasPlanHints, parsePlanHints } from '../sip/sip-ai-import-parser';

const planModeSchema = z.enum(['fixed', 'smart', 'unknown']);
const screenshotTypeSchema = z.enum(['trade_history', 'sip_history', 'position_summary', 'mixed', 'unknown']);
const recordKindSchema = z.enum(['trade', 'sip_deduction', 'dividend', 'skip']);
const sideSchema = z.enum(['buy', 'sell']);

const rawRecordSchema = z
  .object({
    symbol: z.union([z.string(), z.number(), z.null()]).optional(),
    code: z.union([z.string(), z.number(), z.null()]).optional(),
    fundCode: z.union([z.string(), z.number(), z.null()]).optional(),
    instrumentName: z.union([z.string(), z.null()]).optional(),
    name: z.union([z.string(), z.null()]).optional(),
    fundName: z.union([z.string(), z.null()]).optional(),
    side: z.union([sideSchema, z.string(), z.null()]).optional(),
    direction: z.union([z.string(), z.null()]).optional(),
    tradeDate: z.union([z.string(), z.null()]).optional(),
    trade_date: z.union([z.string(), z.null()]).optional(),
    date: z.union([z.string(), z.null()]).optional(),
    confirmDate: z.union([z.string(), z.null()]).optional(),
    price: z.union([z.number(), z.string(), z.null()]).optional(),
    nav: z.union([z.number(), z.string(), z.null()]).optional(),
    unitNav: z.union([z.number(), z.string(), z.null()]).optional(),
    quantity: z.union([z.number(), z.string(), z.null()]).optional(),
    shares: z.union([z.number(), z.string(), z.null()]).optional(),
    confirmShares: z.union([z.number(), z.string(), z.null()]).optional(),
    amount: z.union([z.number(), z.string(), z.null()]).optional(),
    confirmAmount: z.union([z.number(), z.string(), z.null()]).optional(),
    fees: z.union([z.number(), z.string(), z.null()]).optional(),
    commission: z.union([z.number(), z.string(), z.null()]).optional(),
    rawType: z.union([z.string(), z.null()]).optional(),
    type: z.union([z.string(), z.null()]).optional(),
    recordKind: recordKindSchema.optional(),
    kind: z.union([recordKindSchema, z.string(), z.null()]).optional(),
  })
  .passthrough();

const planHintsSchema = z
  .object({
    symbol: z.union([z.string(), z.number(), z.null()]).optional(),
    fundName: z.union([z.string(), z.null()]).optional(),
    amount: z.union([z.number(), z.string(), z.null()]).optional(),
    startDate: z.union([z.string(), z.null()]).optional(),
    frequency: z.union([z.string(), z.null()]).optional(),
    dayOfMonth: z.union([z.number(), z.string(), z.null()]).optional(),
    dayOfWeek: z.union([z.number(), z.string(), z.null()]).optional(),
  })
  .passthrough();

const aiResponseSchema = z.object({
  screenshotType: screenshotTypeSchema.optional(),
  planMode: planModeSchema.optional(),
  planModeLabel: z.union([z.string(), z.null()]).optional(),
  planHints: planHintsSchema.nullish(),
  records: z.array(rawRecordSchema).optional(),
  transactions: z.array(rawRecordSchema).optional(),
  items: z.array(rawRecordSchema).optional(),
  history: z.array(rawRecordSchema).optional(),
  trades: z.array(rawRecordSchema).optional(),
  warnings: z.array(z.string()).optional(),
});

export type LedgerAiScreenshotType = z.infer<typeof screenshotTypeSchema>;

export interface ParsedLedgerAiImportResponse {
  records: LedgerAiExtractedRecord[];
  warnings: string[];
  planMode: SipRecognizedPlanMode;
  planModeLabel: string | null;
  screenshotType: LedgerAiScreenshotType;
  planHints: SipAiPlanHints | null;
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

function parseSide(raw: unknown, rawType: string | null): LedgerAiTradeSide | null {
  if (raw === 'buy' || raw === 'sell') return raw;
  const text = `${String(raw ?? '')} ${rawType ?? ''}`;
  if (/卖|赎回|减仓|平仓/u.test(text)) return 'sell';
  if (/买|申购|建仓|定投|加仓/u.test(text)) return 'buy';
  return null;
}

function parseRecordKind(raw: unknown, rawType: string | null, side: LedgerAiTradeSide | null): LedgerAiRecordKind {
  if (raw === 'trade' || raw === 'sip_deduction' || raw === 'dividend' || raw === 'skip') return raw;
  const text = `${String(raw ?? '')} ${rawType ?? ''}`;
  if (/分红|红利|派息|送股|除权/u.test(text)) return 'dividend';
  if (/定投|扣款|定期/u.test(text)) return 'sip_deduction';
  if (side === 'buy' || side === 'sell') return 'trade';
  return 'skip';
}

/** 从 LLM 原始文本中提取 JSON 正文。 */
export function extractJsonText(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/iu);
  if (fenced?.[1]) return fenced[1].trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) return raw.slice(start, end + 1).trim();
  return raw.trim();
}

function normalizeRawRecord(
  raw: z.infer<typeof rawRecordSchema>,
  sourceImageIndex: number,
  sourceFileName: string | null,
): LedgerAiExtractedRecord | null {
  const symbol = coerceNullableString(raw.symbol ?? raw.code ?? raw.fundCode);
  const instrumentName = coerceNullableString(raw.instrumentName ?? raw.name ?? raw.fundName);
  const rawType = coerceNullableString(raw.rawType ?? raw.type);
  const side = parseSide(raw.side ?? raw.direction, rawType);
  const recordKind = parseRecordKind(raw.recordKind ?? raw.kind, rawType, side);
  const tradeAt = coerceNullableString(raw.tradeDate ?? raw.trade_date ?? raw.date ?? raw.confirmDate);
  const price = coerceNullableNumber(raw.price ?? raw.nav ?? raw.unitNav);
  const quantity = coerceNullableNumber(raw.quantity ?? raw.shares ?? raw.confirmShares);
  const amount = coerceNullableNumber(raw.amount ?? raw.confirmAmount);
  const fees = coerceNullableNumber(raw.fees ?? raw.commission);

  if (recordKind === 'skip') return null;
  if (recordKind === 'dividend') {
    return {
      rowIndex: 0,
      symbol,
      instrumentName,
      side: null,
      tradeAt,
      price,
      quantity,
      amount,
      fees,
      note: null,
      rawType,
      recordKind: 'dividend',
      sourceImageIndex,
      sourceFileName,
    };
  }

  if (
    amount === null &&
    tradeAt === null &&
    price === null &&
    quantity === null &&
    !symbol &&
    !instrumentName
  ) {
    return null;
  }

  return {
    rowIndex: 0,
    symbol,
    instrumentName,
    side,
    tradeAt,
    price,
    quantity,
    amount,
    fees,
    note: null,
    rawType,
    recordKind,
    sourceImageIndex,
    sourceFileName,
  };
}

function collectRawRecords(payload: z.infer<typeof aiResponseSchema>): z.infer<typeof rawRecordSchema>[] {
  return [
    ...(payload.records ?? []),
    ...(payload.transactions ?? []),
    ...(payload.items ?? []),
    ...(payload.history ?? []),
    ...(payload.trades ?? []),
  ];
}

export function hasPartialLedgerRecord(record: LedgerAiExtractedRecord): boolean {
  if (record.recordKind === 'dividend' || record.recordKind === 'skip') return false;
  return Boolean(
    record.symbol ||
      record.instrumentName ||
      record.tradeAt ||
      record.price ||
      record.quantity ||
      record.amount,
  );
}

/** 解析 AI 截图识别 JSON。 */
export function parseLedgerAiImportResponse(
  raw: string,
  sourceImageIndex = 0,
  sourceFileName: string | null = null,
): ParsedLedgerAiImportResponse {
  let payload: unknown;
  try {
    payload = JSON.parse(extractJsonText(raw));
  } catch {
    throw new Error('AI 返回内容无法解析为 JSON，请换一张更清晰的截图重试');
  }

  const parsed = aiResponseSchema.parse(payload);
  const planHints = parsePlanHints(parsed.planHints);
  const normalized = collectRawRecords(parsed)
    .map((record) => normalizeRawRecord(record, sourceImageIndex, sourceFileName))
    .filter((record): record is LedgerAiExtractedRecord => record !== null)
    .map((record, index) => ({ ...record, rowIndex: index + 1 }));

  const warnings = [...(parsed.warnings ?? [])];
  const importable = normalized.filter((record) => record.recordKind === 'trade' || record.recordKind === 'sip_deduction');
  const dividends = normalized.filter((record) => record.recordKind === 'dividend');
  if (dividends.length > 0) {
    warnings.push(`已跳过 ${dividends.length} 条分红记录（请使用分红功能管理）`);
  }

  if (importable.length === 0 && parsed.screenshotType === 'position_summary') {
    warnings.push('截图主要是持仓汇总，未包含成交明细。请打开「成交记录 / 交易明细」页面后重新截图。');
  }

  return {
    records: normalized,
    warnings,
    planMode: parsed.planMode ?? 'unknown',
    planModeLabel: coerceNullableString(parsed.planModeLabel),
    screenshotType: parsed.screenshotType ?? 'unknown',
    planHints: planHints && hasPlanHints(planHints) ? planHints : null,
  };
}

/** 无有效记录时的用户提示。 */
export function buildLedgerAiEmptyRecordsError(input: {
  warnings: string[];
  screenshotType: LedgerAiScreenshotType;
}): string {
  const { warnings, screenshotType } = input;

  if (screenshotType === 'position_summary') {
    return '截图主要是持仓汇总，未包含买卖/申赎明细。请在 App 中打开「成交记录 / 交易明细 / 历史成交」页面后重新截图。';
  }

  if (warnings.length > 0) {
    return `未识别到可导入的流水：${warnings.join('；')}`;
  }

  return '未从截图中识别到买卖或申赎流水。请截取包含成交时间、价格/净值与数量/份额的明细列表。';
}

/** 多图合并去重（symbol + side + 日期 + 数量 + 价格）。 */
export function mergeLedgerExtractedRecords(records: LedgerAiExtractedRecord[]): LedgerAiExtractedRecord[] {
  const seen = new Set<string>();
  const merged: LedgerAiExtractedRecord[] = [];

  for (const record of records) {
    if (record.recordKind !== 'trade' && record.recordKind !== 'sip_deduction') continue;
    const day = record.tradeAt?.slice(0, 10) ?? '';
    const key = [
      record.symbol ?? record.instrumentName ?? '',
      record.side ?? record.recordKind,
      day,
      record.quantity?.toFixed(4) ?? '',
      record.price?.toFixed(4) ?? '',
      record.amount?.toFixed(2) ?? '',
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(record);
  }

  return merged.map((record, index) => ({ ...record, rowIndex: index + 1 }));
}
