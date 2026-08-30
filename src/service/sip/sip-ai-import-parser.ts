import { z } from 'zod';
import type { SipRecognizedPlanMode } from '../../shared/sip/import-hints';
import type { SipAiExtractedRecord, SipAiPlanHints } from '../../shared/sip/import-types';

const planModeSchema = z.enum(['fixed', 'smart', 'unknown']);
const screenshotTypeSchema = z.enum(['deduction_history', 'plan_settings', 'mixed', 'unknown']);

const rawRecordSchema = z
  .object({
    symbol: z.union([z.string(), z.number(), z.null()]).optional(),
    code: z.union([z.string(), z.number(), z.null()]).optional(),
    fundCode: z.union([z.string(), z.number(), z.null()]).optional(),
    fundName: z.union([z.string(), z.null()]).optional(),
    name: z.union([z.string(), z.null()]).optional(),
    fund: z.union([z.string(), z.null()]).optional(),
    tradeDate: z.union([z.string(), z.null()]).optional(),
    trade_date: z.union([z.string(), z.null()]).optional(),
    date: z.union([z.string(), z.null()]).optional(),
    deductionDate: z.union([z.string(), z.null()]).optional(),
    confirmDate: z.union([z.string(), z.null()]).optional(),
    nav: z.union([z.number(), z.string(), z.null()]).optional(),
    netValue: z.union([z.number(), z.string(), z.null()]).optional(),
    unitNav: z.union([z.number(), z.string(), z.null()]).optional(),
    amount: z.union([z.number(), z.string(), z.null()]).optional(),
    confirmAmount: z.union([z.number(), z.string(), z.null()]).optional(),
    deductionAmount: z.union([z.number(), z.string(), z.null()]).optional(),
    quantity: z.union([z.number(), z.string(), z.null()]).optional(),
    shares: z.union([z.number(), z.string(), z.null()]).optional(),
    confirmShares: z.union([z.number(), z.string(), z.null()]).optional(),
    fees: z.union([z.number(), z.string(), z.null()]).optional(),
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
  planMode: planModeSchema.optional(),
  planModeLabel: z.union([z.string(), z.null()]).optional(),
  screenshotType: screenshotTypeSchema.optional(),
  planHints: planHintsSchema.nullish(),
  records: z.array(rawRecordSchema).optional(),
  transactions: z.array(rawRecordSchema).optional(),
  items: z.array(rawRecordSchema).optional(),
  history: z.array(rawRecordSchema).optional(),
  deductions: z.array(rawRecordSchema).optional(),
  warnings: z.array(z.string()).optional(),
});

export type SipAiScreenshotType = z.infer<typeof screenshotTypeSchema>;

export interface ParsedSipAiImportResponse {
  records: SipAiExtractedRecord[];
  warnings: string[];
  planMode: SipRecognizedPlanMode;
  planModeLabel: string | null;
  screenshotType: SipAiScreenshotType;
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

/** 从 LLM 原始文本中提取 JSON 正文。 */
export function extractJsonText(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/iu);
  if (fenced?.[1]) return fenced[1].trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) return raw.slice(start, end + 1).trim();
  return raw.trim();
}

function normalizeRawRecord(raw: z.infer<typeof rawRecordSchema>): SipAiExtractedRecord | null {
  const symbol = coerceNullableString(raw.symbol ?? raw.code ?? raw.fundCode);
  const fundName = coerceNullableString(raw.fundName ?? raw.name ?? raw.fund);
  const tradeAt = coerceNullableString(
    raw.tradeDate ?? raw.trade_date ?? raw.date ?? raw.deductionDate ?? raw.confirmDate,
  );
  const nav = coerceNullableNumber(raw.nav ?? raw.netValue ?? raw.unitNav);
  const amount = coerceNullableNumber(raw.amount ?? raw.confirmAmount ?? raw.deductionAmount);
  const quantity = coerceNullableNumber(raw.quantity ?? raw.shares ?? raw.confirmShares);
  const fees = coerceNullableNumber(raw.fees);

  if (amount === null && tradeAt === null && nav === null && quantity === null && !symbol && !fundName) {
    return null;
  }

  return {
    rowIndex: 0,
    symbol,
    fundName,
    tradeAt,
    nav,
    amount,
    quantity,
    fees,
  };
}

export function parsePlanHints(raw: z.infer<typeof planHintsSchema> | undefined): SipAiPlanHints | null {
  if (!raw) return null;
  const amount = coerceNullableNumber(raw.amount);
  const dayOfMonth = coerceNullableNumber(raw.dayOfMonth);
  const dayOfWeek = coerceNullableNumber(raw.dayOfWeek);
  const hints: SipAiPlanHints = {
    symbol: coerceNullableString(raw.symbol),
    fundName: coerceNullableString(raw.fundName),
    amount,
    startDate: coerceNullableString(raw.startDate),
    frequency: coerceNullableString(raw.frequency),
    dayOfMonth: dayOfMonth === null ? null : Math.trunc(dayOfMonth),
    dayOfWeek: dayOfWeek === null ? null : Math.trunc(dayOfWeek),
  };
  return hasPlanHints(hints) ? hints : null;
}

export function hasPlanHints(hints: SipAiPlanHints): boolean {
  return Boolean(hints.symbol || hints.fundName || hints.amount || hints.startDate);
}

export function hasPartialExtractedRecord(record: SipAiExtractedRecord): boolean {
  return Boolean(record.symbol || record.fundName || record.tradeAt || record.amount || record.nav || record.quantity);
}

/** 根据计划信息生成待补全的导入草稿。 */
export function draftRecordFromPlanHints(hints: SipAiPlanHints): SipAiExtractedRecord {
  return {
    rowIndex: 1,
    symbol: hints.symbol,
    fundName: hints.fundName,
    tradeAt: hints.startDate,
    nav: null,
    amount: hints.amount,
    quantity: null,
    fees: null,
  };
}

function finalizeParsedResponse(
  parsed: z.infer<typeof aiResponseSchema>,
  records: SipAiExtractedRecord[],
): ParsedSipAiImportResponse {
  const warnings = [...(parsed.warnings ?? [])];
  const planHints = parsePlanHints(parsed.planHints);
  let nextRecords = records;

  if (nextRecords.length === 0 && planHints) {
    nextRecords = [draftRecordFromPlanHints(planHints)];
    warnings.push('截图未包含完整扣款明细，已根据计划信息生成待补全记录，请手动填写标的代码、扣款日期与净值。');
  }

  return {
    records: nextRecords,
    warnings,
    planMode: parsed.planMode ?? 'unknown',
    planModeLabel: coerceNullableString(parsed.planModeLabel),
    screenshotType: parsed.screenshotType ?? 'unknown',
    planHints,
  };
}
function collectRawRecords(payload: z.infer<typeof aiResponseSchema>): z.infer<typeof rawRecordSchema>[] {
  return [
    ...(payload.records ?? []),
    ...(payload.transactions ?? []),
    ...(payload.items ?? []),
    ...(payload.history ?? []),
    ...(payload.deductions ?? []),
  ];
}

/** 解析 AI 截图识别 JSON。 */
export function parseSipAiImportResponse(raw: string): ParsedSipAiImportResponse {
  let payload: unknown;
  try {
    payload = JSON.parse(extractJsonText(raw));
  } catch {
    throw new Error('AI 返回内容无法解析为 JSON，请换一张更清晰的截图重试');
  }

  const parsed = aiResponseSchema.parse(payload);
  const normalized = collectRawRecords(parsed)
    .map((record) => normalizeRawRecord(record))
    .filter((record): record is SipAiExtractedRecord => record !== null)
    .map((record, index) => ({ ...record, rowIndex: index + 1 }));

  return finalizeParsedResponse(parsed, normalized);
}

/** 无扣款记录时的用户提示。 */
export function buildSipAiEmptyRecordsError(input: {
  warnings: string[];
  planModeLabel: string | null;
  screenshotType: SipAiScreenshotType;
}): string {
  const { warnings, planModeLabel, screenshotType } = input;

  if (screenshotType === 'plan_settings') {
    const modeHint = planModeLabel ? `（${planModeLabel}）` : '';
    return `截图主要是定投计划设置${modeHint}，未包含历史扣款明细。请在 App 中打开「扣款记录 / 定投记录 / 交易明细」页面后重新截图。`;
  }

  if (warnings.length > 0) {
    return `未识别到可导入的扣款记录：${warnings.join('；')}`;
  }

  return '未从截图中识别到定投扣款记录。请截取包含扣款时间、确认金额或份额的明细列表（不要只截计划设置页）。';
}
