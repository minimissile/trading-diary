import { z } from 'zod';
import type {
  LedgerAiExtractedRecord,
  LedgerAiRecordKind,
  LedgerAiTradeChannel,
  LedgerAiTradeSide,
} from '../../shared/portfolio/ledger-import-types';
import type { SipRecognizedPlanMode } from '../../shared/sip/import-hints';
import type { SipAiPlanHints } from '../../shared/sip/import-types';
import { hasPlanHints, parsePlanHints } from '../sip/sip-ai-import-parser';
import { inferTradeChannelFromText, parseTradeChannel } from './ledger-import-instrument';

const planModeSchema = z.enum(['fixed', 'smart', 'unknown']);
const screenshotTypeSchema = z.enum(['trade_history', 'sip_history', 'position_summary', 'mixed', 'unknown']);
const recordKindSchema = z.enum(['trade', 'sip_deduction', 'dividend', 'skip']);
const sideSchema = z.enum(['buy', 'sell']);
const tradeChannelSchema = z.enum(['exchange', 'otc', 'fund', 'off_exchange', 'on_exchange', 'broker']);

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
    purchaseTime: z.union([z.string(), z.null()]).optional(),
    tradeTime: z.union([z.string(), z.null()]).optional(),
    serviceFee: z.union([z.number(), z.string(), z.null()]).optional(),
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
    tradeChannel: tradeChannelSchema.optional(),
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
  tradeChannel: tradeChannelSchema.optional(),
  tradeChannelLabel: z.union([z.string(), z.null()]).optional(),
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
  tradeChannel: LedgerAiTradeChannel;
  tradeChannelLabel: string | null;
  planMode: SipRecognizedPlanMode;
  planModeLabel: string | null;
  screenshotType: LedgerAiScreenshotType;
  planHints: SipAiPlanHints | null;
}

function coerceNullableString(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  return text ? text : null;
}

function coerceNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[,，\s￥¥元]/gu, '').trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/** 过滤 AI 误把买入金额写入 fees 的情况。 */
function normalizeFundFees(fees: number | null, amount: number | null): number | null {
  if (fees === null) return null;
  if (amount !== null && fees >= amount) return null;
  if (amount !== null && amount >= 10 && fees > amount * 0.05) return null;
  return fees;
}

function parseSide(raw: unknown, rawType: string | null): LedgerAiTradeSide | null {
  if (raw === 'buy' || raw === 'sell') return raw;
  const text = `${coerceNullableString(raw) ?? ''} ${rawType ?? ''}`;
  if (/卖|赎回|减仓|平仓/u.test(text)) return 'sell';
  if (/买|申购|建仓|定投|加仓/u.test(text)) return 'buy';
  return null;
}

function parseRecordKind(raw: unknown, rawType: string | null, side: LedgerAiTradeSide | null): LedgerAiRecordKind {
  if (raw === 'trade' || raw === 'sip_deduction' || raw === 'dividend' || raw === 'skip') return raw;
  const text = `${coerceNullableString(raw) ?? ''} ${rawType ?? ''}`;
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
  const confirmAt = coerceNullableString(raw.confirmDate);
  const purchaseTime = coerceNullableString(raw.purchaseTime ?? raw.tradeTime);
  const tradeDate = coerceNullableString(raw.tradeDate ?? raw.trade_date ?? raw.date);
  const confirmAmount = coerceNullableNumber(raw.confirmAmount);
  const purchaseAmount = coerceNullableNumber(raw.amount);
  const amount = confirmAmount ?? purchaseAmount;
  const amountIsNetConfirmed = confirmAmount !== null;
  const price = coerceNullableNumber(raw.unitNav ?? raw.nav ?? raw.price);
  const quantity = coerceNullableNumber(raw.confirmShares ?? raw.shares ?? raw.quantity);
  const fees = normalizeFundFees(coerceNullableNumber(raw.fees ?? raw.commission ?? raw.serviceFee), amount);
  const tradeChannel = parseTradeChannel(raw.tradeChannel);
  const hasConfirmFields = confirmAt !== null || confirmAmount !== null || price !== null || quantity !== null;
  const tradeAt = purchaseTime ?? tradeDate ?? (hasConfirmFields ? null : confirmAt);

  const baseFields = {
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
    tradeChannel: tradeChannel ?? null,
    confirmAt,
    amountIsNetConfirmed,
    sourceImageIndex,
    sourceFileName,
  };

  if (recordKind === 'skip') return null;
  if (recordKind === 'dividend') {
    return { ...baseFields, side: null, recordKind: 'dividend' };
  }

  if (amount === null && tradeAt === null && price === null && quantity === null && !symbol && !instrumentName) {
    return null;
  }

  return { ...baseFields, recordKind };
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
  return Boolean(record.symbol || record.instrumentName || record.tradeAt || record.price || record.quantity || record.amount);
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
  const responseChannel = parseTradeChannel(parsed.tradeChannel);
  const inferredChannel =
    responseChannel ??
    inferTradeChannelFromText(
      [
        parsed.tradeChannelLabel ?? '',
        ...(parsed.warnings ?? []),
        ...collectRawRecords(parsed).map(
          (record) => `${record.rawType ?? ''} ${record.type ?? ''} ${record.instrumentName ?? record.name ?? ''}`,
        ),
      ].join(' '),
    );
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
    tradeChannel: inferredChannel ?? 'exchange',
    tradeChannelLabel: coerceNullableString(parsed.tradeChannelLabel),
    planMode: parsed.planMode ?? 'unknown',
    planModeLabel: coerceNullableString(parsed.planModeLabel),
    screenshotType: parsed.screenshotType ?? 'unknown',
    planHints: planHints && hasPlanHints(planHints) ? planHints : null,
  };
}

/** 无有效记录时的用户提示。 */
export function buildLedgerAiEmptyRecordsError(input: { warnings: string[]; screenshotType: LedgerAiScreenshotType }): string {
  const { warnings, screenshotType } = input;

  if (screenshotType === 'position_summary') {
    return '截图主要是持仓汇总，未包含买卖/申赎明细。请在 App 中打开「成交记录 / 交易明细 / 历史成交」页面后重新截图。';
  }

  if (warnings.length > 0) {
    return `未识别到可导入的流水：${warnings.join('；')}`;
  }

  return '未从截图中识别到买卖或申赎流水。请截取包含成交时间、价格/净值与数量/份额的明细列表。';
}

/** 多图合并：同一标的+方向+相邻申请/确认日合并，保留字段更完整的一条。 */
export function mergeLedgerExtractedRecords(records: LedgerAiExtractedRecord[]): LedgerAiExtractedRecord[] {
  const importable = records.filter((record) => record.recordKind === 'trade' || record.recordKind === 'sip_deduction');
  const clusters: LedgerAiExtractedRecord[][] = [];

  for (const record of importable) {
    const cluster = clusters.find((items) => recordsShouldCluster(items[0]!, record));
    if (cluster) {
      cluster.push(record);
    } else {
      clusters.push([record]);
    }
  }

  return clusters
    .map((cluster) =>
      cluster.reduce((merged, current) => {
        const leftScore = scoreRecordCompleteness(merged);
        const rightScore = scoreRecordCompleteness(current);
        const [richer, poorer] = leftScore >= rightScore ? [merged, current] : [current, merged];
        return mergeRecordFields(richer, poorer);
      }),
    )
    .map((record, index) => ({ ...record, rowIndex: index + 1 }));
}

function recordsShouldCluster(a: LedgerAiExtractedRecord, b: LedgerAiExtractedRecord): boolean {
  if (a.recordKind !== b.recordKind) return false;
  const symbolA = a.symbol ?? a.instrumentName ?? '';
  const symbolB = b.symbol ?? b.instrumentName ?? '';
  if (symbolA !== symbolB) return false;
  if ((a.side ?? a.recordKind) !== (b.side ?? b.recordKind)) return false;

  const daysA = collectRecordDays(a);
  const daysB = collectRecordDays(b);
  if (daysA.length === 0 || daysB.length === 0) return true;

  for (const dayA of daysA) {
    for (const dayB of daysB) {
      if (dayA === dayB) return true;
    }
  }

  // 定投每期独立，禁止跨日合并
  if (a.recordKind === 'sip_deduction') return false;

  // 买卖：仅合并「列表 + 详情」互补记录（如 1/19 申请 + 1/20 确认）
  const aHasQuote = a.price !== null && a.quantity !== null;
  const bHasQuote = b.price !== null && b.quantity !== null;
  if (aHasQuote === bHasQuote) return false;

  for (const dayA of daysA) {
    for (const dayB of daysB) {
      if (Math.abs(dayDiff(dayA, dayB)) <= 1) return true;
    }
  }
  return false;
}

function collectRecordDays(record: LedgerAiExtractedRecord): string[] {
  const days = new Set<string>();
  const tradeDay = record.tradeAt?.slice(0, 10);
  const confirmDay = record.confirmAt?.slice(0, 10);
  if (tradeDay) days.add(tradeDay);
  if (confirmDay) days.add(confirmDay);
  return [...days];
}

function dayDiff(left: string, right: string): number {
  const start = Date.parse(`${left}T00:00:00`);
  const end = Date.parse(`${right}T00:00:00`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return Number.POSITIVE_INFINITY;
  return Math.round((end - start) / 86_400_000);
}

function scoreRecordCompleteness(record: LedgerAiExtractedRecord): number {
  let score = 0;
  if (record.price !== null) score += 2;
  if (record.quantity !== null) score += 2;
  if (record.amountIsNetConfirmed) score += 2;
  if (record.confirmAt) score += 1;
  if (record.fees !== null) score += 1;
  return score;
}

function pickRicherTradeAt(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  if (left.length !== right.length) return left.length > right.length ? left : right;
  return left.includes(':') ? left : right;
}

function mergeRecordFields(primary: LedgerAiExtractedRecord, secondary: LedgerAiExtractedRecord): LedgerAiExtractedRecord {
  const pick = <T>(left: T | null, right: T | null): T | null => left ?? right;
  const amount = primary.amountIsNetConfirmed
    ? primary.amount
    : secondary.amountIsNetConfirmed
      ? secondary.amount
      : pick(primary.amount, secondary.amount);

  return {
    ...primary,
    symbol: pick(primary.symbol, secondary.symbol),
    instrumentName: pick(primary.instrumentName, secondary.instrumentName),
    side: pick(primary.side, secondary.side),
    tradeAt: pickRicherTradeAt(primary.tradeAt, secondary.tradeAt),
    confirmAt: pick(primary.confirmAt, secondary.confirmAt),
    price: pick(primary.price, secondary.price),
    quantity: pick(primary.quantity, secondary.quantity),
    amount,
    amountIsNetConfirmed: primary.amountIsNetConfirmed || secondary.amountIsNetConfirmed,
    fees: pick(primary.fees, secondary.fees),
    rawType: pick(primary.rawType, secondary.rawType),
    tradeChannel: pick(primary.tradeChannel, secondary.tradeChannel),
    sourceImageIndex: primary.sourceImageIndex,
    sourceFileName: pick(primary.sourceFileName, secondary.sourceFileName),
  };
}
