import { shiftCalendarDate, todayCalendarDate, TRADE_DATE_FORMAT } from '../../shared/trade-calendar';

/** 收益日历统计窗口：近一年（自然日）。 */
export const PNL_CALENDAR_WINDOW_DAYS = 365;

/** 单次拉取日 K 上限（约 1 年交易日 + 缓冲）。 */
export const PNL_CALENDAR_MAX_BARS = 280;

/** 同一 symbol 全量同步最小间隔（毫秒）。 */
export const DAILY_BAR_SYNC_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** 串行同步 symbol 之间的请求间隔（毫秒），降低被封 IP 风险。 */
export const DAILY_BAR_SYNC_REQUEST_DELAY_MS = 800;

/** 增量同步时拉取最近 N 根 K 线。 */
export const DAILY_BAR_INCREMENTAL_LIMIT = 8;

export function pnlCalendarWindowEnd(asOf: Date = new Date()): string {
  return todayCalendarDate(asOf);
}

export function pnlCalendarWindowStart(asOf: Date = new Date()): string {
  return shiftCalendarDate(pnlCalendarWindowEnd(asOf), -PNL_CALENDAR_WINDOW_DAYS);
}

export function isDateInPnlCalendarWindow(date: string, asOf: Date = new Date()): boolean {
  const start = pnlCalendarWindowStart(asOf);
  const end = pnlCalendarWindowEnd(asOf);
  return date >= start && date <= end;
}

export function monthPrefixFromDate(date: string): string {
  return date.slice(0, 7);
}

export function currentMonthPrefix(asOf: Date = new Date()): string {
  const end = pnlCalendarWindowEnd(asOf);
  return monthPrefixFromDate(end);
}

export function formatMonthPrefix(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function parseMonthPrefix(month: string): { year: number; month: number } {
  const match = month.match(/^(\d{4})-(\d{2})$/u);
  if (!match) throw new Error(`月份格式无效：${month}`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

export function datesInMonth(month: string): string[] {
  const { year, month: monthIndex } = parseMonthPrefix(month);
  const days: string[] = [];
  const cursor = new Date(year, monthIndex - 1, 1);
  while (cursor.getMonth() === monthIndex - 1) {
    const day = String(cursor.getDate()).padStart(2, '0');
    days.push(`${year}-${String(monthIndex).padStart(2, '0')}-${day}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export { TRADE_DATE_FORMAT };
