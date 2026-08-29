import type { SipAiPlanHints } from '../../shared/sip/import-types';
import type { CreateFundSipPlanInput, SipFrequency } from '../../shared/sip/types';
import type { NormalizedSipImportRow } from './sip-row-normalizer';
import { isoWeekday } from './sip-scheduler';

export const SIP_IMPORT_AUTO_PLAN_THESIS = '由历史扣款导入自动创建，请核对周期与每期金额。';

function parseHintFrequency(raw: string | null | undefined): SipFrequency | null {
  if (!raw) return null;
  const text = raw.trim().toLowerCase();
  if (text.includes('biweek') || text.includes('双周') || text.includes('两周')) return 'biweekly';
  if (text.includes('week') || text.includes('每周') || text.includes('周定')) return 'weekly';
  if (text.includes('month') || text.includes('每月') || text.includes('月')) return 'monthly';
  return null;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function mode(values: number[]): number {
  const counts = new Map<number, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best = values[0] ?? 1;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function inferTypicalAmount(rows: NormalizedSipImportRow[], hintAmount: number | null | undefined): number {
  if (typeof hintAmount === 'number' && hintAmount > 0) return Math.round(hintAmount * 100) / 100;
  const amounts = rows.map((row) => row.amount).filter((value) => value > 0);
  if (amounts.length === 0) throw new Error('无法推断每期金额');
  return Math.round(median(amounts) * 100) / 100;
}

function inferScheduleFromDates(
  dates: string[],
  hints?: SipAiPlanHints | null,
): Pick<CreateFundSipPlanInput, 'frequency' | 'dayOfWeek' | 'dayOfMonth'> {
  const hinted = parseHintFrequency(hints?.frequency ?? null);
  if (hinted === 'monthly') {
    const day = clampDayOfMonth(hints?.dayOfMonth ?? dayFromDates(dates));
    return { frequency: 'monthly', dayOfMonth: day, dayOfWeek: undefined };
  }
  if (hinted === 'weekly' || hinted === 'biweekly') {
    const day = clampDayOfWeek(hints?.dayOfWeek ?? weekdayFromDates(dates));
    return { frequency: hinted, dayOfWeek: day, dayOfMonth: undefined };
  }

  const gaps: number[] = [];
  for (let index = 1; index < dates.length; index += 1) {
    const prev = dates[index - 1];
    const next = dates[index];
    if (!prev || !next) continue;
    gaps.push(Math.round((Date.parse(`${next}T12:00:00`) - Date.parse(`${prev}T12:00:00`)) / 86_400_000));
  }

  if (gaps.length === 0) {
    return { frequency: 'monthly', dayOfMonth: dayFromDates(dates), dayOfWeek: undefined };
  }

  const typicalGap = median(gaps);
  if (typicalGap <= 10) {
    return { frequency: 'weekly', dayOfWeek: weekdayFromDates(dates), dayOfMonth: undefined };
  }
  if (typicalGap <= 18) {
    return { frequency: 'biweekly', dayOfWeek: weekdayFromDates(dates), dayOfMonth: undefined };
  }
  return { frequency: 'monthly', dayOfMonth: dayFromDates(dates), dayOfWeek: undefined };
}

function dayFromDates(dates: string[]): number {
  const days = dates.map((date) => Math.min(Number(date.slice(8, 10)), 28));
  return clampDayOfMonth(mode(days));
}

function weekdayFromDates(dates: string[]): number {
  return clampDayOfWeek(mode(dates.map((date) => isoWeekday(date))));
}

function clampDayOfMonth(value: number): number {
  return Math.min(28, Math.max(1, Math.trunc(value)));
}

function clampDayOfWeek(value: number): number {
  return Math.min(7, Math.max(1, Math.trunc(value)));
}

function normalizeHintSymbol(symbol: string | null | undefined): string | null {
  if (!symbol) return null;
  const digits = symbol.match(/\d{6}/u);
  return digits?.[0] ?? symbol.trim();
}

/** 根据同一标的的导入记录（与可选 AI 计划提示）推断定投计划。 */
export function inferSipPlanInputFromImport(
  rows: NormalizedSipImportRow[],
  hints?: SipAiPlanHints | null,
): CreateFundSipPlanInput {
  if (rows.length === 0) throw new Error('无法从空记录推断定投计划');

  const symbol = rows[0]!.symbol;
  const dates = [...new Set(rows.map((row) => row.scheduledDate))].sort();
  const hintSymbol = normalizeHintSymbol(hints?.symbol);
  const scopedHints = hintSymbol && hintSymbol === symbol ? hints : null;
  const startDate = scopedHints?.startDate?.slice(0, 10) ?? dates[0]!;
  const schedule = inferScheduleFromDates(dates, scopedHints);

  return {
    symbol,
    amount: inferTypicalAmount(rows, scopedHints?.amount),
    frequency: schedule.frequency,
    dayOfWeek: schedule.dayOfWeek,
    dayOfMonth: schedule.dayOfMonth,
    startDate,
    thesis: SIP_IMPORT_AUTO_PLAN_THESIS,
    activateNow: true,
  };
}
