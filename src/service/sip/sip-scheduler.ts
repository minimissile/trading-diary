import type { CreateFundSipPlanInput, FundSipOccurrence, SipFrequency } from '../../shared/sip/types';
import { SIP_DAILY_ROLLING_HORIZON, SIP_GRACE_DAYS, SIP_ROLLING_HORIZON } from '../../shared/sip/types';
import { isTradingDay } from '../../shared/trade-calendar';

/** ISO 日期比较：a 早于 b 返回 -1。 */
export function compareIsoDate(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** 日期加减天数，返回 YYYY-MM-DD。 */
export function shiftIsoDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

/** 返回 ISO 星期（1=周一 … 7=周日）。 */
export function isoWeekday(isoDate: string): number {
  const day = new Date(`${isoDate}T12:00:00`).getDay();
  return day === 0 ? 7 : day;
}

/** 将日期推进到指定 ISO 星期（若已是则不变）。 */
export function alignToWeekday(isoDate: string, dayOfWeek: number): string {
  let current = isoDate;
  while (isoWeekday(current) !== dayOfWeek) {
    current = shiftIsoDate(current, 1);
  }
  return current;
}

/** 月份递增并保持在 dayOfMonth（最大 28）。 */
export function addMonthsOnDay(isoDate: string, months: number, dayOfMonth: number): string {
  const [yearText, monthText] = isoDate.split('-');
  const year = Number(yearText);
  const month = Number(monthText) - 1 + months;
  const date = new Date(Date.UTC(year, month, 1, 12, 0, 0));
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(dayOfMonth, Math.min(lastDay, 28));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** 找到不早于 startDate 的首个月度扣款日。 */
export function firstMonthlyDate(startDate: string, dayOfMonth: number): string {
  const [yearText, monthText] = isoDateParts(startDate);
  const day = Math.min(dayOfMonth, 28);
  let candidate = `${yearText}-${monthText}-${String(day).padStart(2, '0')}`;
  if (compareIsoDate(candidate, startDate) < 0) {
    candidate = addMonthsOnDay(`${yearText}-${monthText}-01`, 1, dayOfMonth);
  }
  return candidate;
}

function isoDateParts(isoDate: string): [string, string, string] {
  const [year, month, day] = isoDate.split('-');
  return [year ?? '1970', month ?? '01', day ?? '01'];
}

export interface ScheduleInput {
  frequency: SipFrequency;
  startDate: string;
  endDate?: string | null;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  afterDate?: string;
  count: number;
}

/** 生成未来若干期次的计划扣款日。 */
export function generateOccurrenceDates(input: ScheduleInput): string[] {
  const { frequency, startDate, endDate, dayOfWeek, dayOfMonth, afterDate, count } = input;
  if (count <= 0) return [];

  const minDate = afterDate && compareIsoDate(afterDate, startDate) > 0 ? afterDate : startDate;
  const dates: string[] = [];

  if (frequency === 'daily') {
    let current = compareIsoDate(startDate, minDate) >= 0 ? startDate : minDate;
    while (!isTradingDay(current)) {
      current = shiftIsoDate(current, 1);
    }
    while (dates.length < count) {
      if (endDate && compareIsoDate(current, endDate) > 0) break;
      dates.push(current);
      do {
        current = shiftIsoDate(current, 1);
      } while (!isTradingDay(current));
    }
    return dates;
  }

  if (frequency === 'weekly') {
    if (!dayOfWeek) throw new Error('每周定投需要指定 weekday');
    let current = alignToWeekday(startDate, dayOfWeek);
    if (compareIsoDate(current, minDate) < 0) {
      const diff = Math.ceil((parseIso(minDate) - parseIso(current)) / 86_400_000 / 7) * 7;
      current = shiftIsoDate(current, diff);
      if (compareIsoDate(current, minDate) < 0) current = shiftIsoDate(current, 7);
    }
    while (dates.length < count) {
      if (endDate && compareIsoDate(current, endDate) > 0) break;
      if (compareIsoDate(current, minDate) >= 0) dates.push(current);
      current = shiftIsoDate(current, 7);
    }
    return dates;
  }

  if (frequency === 'biweekly') {
    if (!dayOfWeek) throw new Error('每两周定投需要指定 weekday');
    const anchor = alignToWeekday(startDate, dayOfWeek);
    let current = anchor;
    if (compareIsoDate(current, minDate) < 0) {
      while (compareIsoDate(current, minDate) < 0) {
        current = shiftIsoDate(current, 14);
      }
    }
    while (dates.length < count) {
      if (endDate && compareIsoDate(current, endDate) > 0) break;
      if (compareIsoDate(current, minDate) >= 0) dates.push(current);
      current = shiftIsoDate(current, 14);
    }
    return dates;
  }

  if (!dayOfMonth) throw new Error('每月定投需要指定 dayOfMonth');
  let current = firstMonthlyDate(startDate, dayOfMonth);
  if (compareIsoDate(current, minDate) < 0) {
    current = firstMonthlyDate(shiftIsoDate(minDate, 0), dayOfMonth);
    if (compareIsoDate(current, minDate) < 0) {
      current = addMonthsOnDay(`${minDate.slice(0, 7)}-01`, 1, dayOfMonth);
    }
  }
  while (dates.length < count) {
    if (endDate && compareIsoDate(current, endDate) > 0) break;
    if (compareIsoDate(current, minDate) >= 0) dates.push(current);
    current = addMonthsOnDay(`${current.slice(0, 7)}-01`, 1, dayOfMonth);
  }
  return dates;
}

function parseIso(isoDate: string): number {
  return new Date(`${isoDate}T12:00:00`).getTime();
}

/** 预览创建计划时的期次日期。 */
export function previewSchedule(input: CreateFundSipPlanInput, count = 6): string[] {
  return generateOccurrenceDates({
    frequency: input.frequency,
    startDate: input.startDate,
    endDate: input.endDate,
    dayOfWeek: input.dayOfWeek,
    dayOfMonth: input.dayOfMonth,
    count,
  });
}

/** 根据金额与净值计算份额（保留 2 位小数，场外基金惯例）。 */
export function computeQuantityFromAmount(amount: number, nav: number, fees = 0): number {
  if (nav <= 0) throw new Error('净值必须大于 0');
  const investable = Math.max(0, amount - fees);
  return Math.round((investable / nav) * 100) / 100;
}

export function rollingHorizonForFrequency(frequency: SipFrequency): number {
  return frequency === 'daily' ? SIP_DAILY_ROLLING_HORIZON : SIP_ROLLING_HORIZON;
}

/** 扫描应标记为 due / missed 的期次 ID。 */
export function resolveDueTransitions(
  occurrences: Pick<FundSipOccurrence, 'id' | 'scheduledDate' | 'status'>[],
  today: string,
  graceDays = SIP_GRACE_DAYS,
): { toDue: string[]; toMissed: string[] } {
  const toDue: string[] = [];
  const toMissed: string[] = [];
  const missedBefore = shiftIsoDate(today, -graceDays);

  for (const item of occurrences) {
    if (item.status === 'scheduled' && compareIsoDate(item.scheduledDate, today) <= 0) {
      toDue.push(item.id);
    }
    if (item.status === 'due' && compareIsoDate(item.scheduledDate, missedBefore) < 0) {
      toMissed.push(item.id);
    }
  }

  return { toDue, toMissed };
}

/** 计算滚动窗口内还需补生成的期次数。 */
export function rollingOccurrenceCount(existingDates: string[], today: string, frequency: SipFrequency = 'monthly'): number {
  const horizon = rollingHorizonForFrequency(frequency);
  const scheduledAhead = existingDates.filter((date) => compareIsoDate(date, today) >= 0).length;
  return Math.max(0, horizon - scheduledAhead);
}

export { SIP_DAILY_ROLLING_HORIZON, SIP_GRACE_DAYS, SIP_ROLLING_HORIZON };
