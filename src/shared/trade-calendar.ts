import dayjs, { type Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import type { InstrumentKind } from './market/types';

dayjs.extend(utc);
dayjs.extend(timezone);

/** A 股 / 基金流水使用的交易日历时区。 */
export const TRADE_MARKET_TIMEZONE = 'Asia/Shanghai';

export const TRADE_DATE_FORMAT = 'YYYY-MM-DD';

export function tradeCalendarDate(tradeAt: string): string {
  return dayjs(tradeAt).tz(TRADE_MARKET_TIMEZONE).format(TRADE_DATE_FORMAT);
}

export function todayCalendarDate(asOf: Date = new Date()): string {
  return dayjs(asOf).tz(TRADE_MARKET_TIMEZONE).format(TRADE_DATE_FORMAT);
}

export function shiftCalendarDate(date: string, days: number): string {
  return calendarDateToDayjs(date).add(days, 'day').format(TRADE_DATE_FORMAT);
}

export function calendarDateToDayjs(date: string): Dayjs {
  return dayjs.tz(date, TRADE_DATE_FORMAT, TRADE_MARKET_TIMEZONE).startOf('day');
}

/** A 股场内交易日（暂不含法定节假日）。 */
export function isTradingDay(date: string): boolean {
  const weekday = calendarDateToDayjs(date).day();
  return weekday >= 1 && weekday <= 5;
}

/** 规范化基金净值公布日期（PDATE / FSRQ）。 */
export function normalizeFundNavDate(navDate: string): string {
  const trimmed = navDate.trim();
  if (/^\d{4}-\d{2}-\d{2}$/u.test(trimmed)) return trimmed;
  return tradeCalendarDate(trimmed);
}

/** 基金净值是否在指定日历日发布。 */
export function isFundNavPublishedOnDate(navDate: string | null | undefined, date: string): boolean {
  if (!navDate) return false;
  return normalizeFundNavDate(navDate) === date;
}

/**
 * 场外基金是否应在该日计入日收益。
 * 交易日始终计入；非交易日仅当净值当日有更新（如部分货币基金周末公布净值）。
 */
export function shouldCountOtcFundDailyPnl(input: {
  date: string;
  navDate?: string | null;
  close?: number | null;
  prevClose?: number | null;
}): boolean {
  if (isTradingDay(input.date)) return true;
  return isFundNavPublishedOnDate(input.navDate, input.date);
}

/**  inclusive 区间内的交易日数量。 */
export function countTradingDaysInclusive(start: string, end: string): number {
  if (end < start) return 0;
  let count = 0;
  let current = start;
  while (current <= end) {
    if (isTradingDay(current)) count += 1;
    current = shiftCalendarDate(current, 1);
  }
  return count;
}

export function previousTradingDay(date: string): string {
  let current = shiftCalendarDate(date, -1);
  while (!isTradingDay(current)) {
    current = shiftCalendarDate(current, -1);
  }
  return current;
}

/**
 * 同花顺「当日参考盈亏」：建仓当日或上一自然日，日收益等于参考浮盈。
 * 非交易日由 computePositionDailyPnl 直接返回 0，不在此判定。
 */
export function shouldUseReferenceDailyPnl(
  firstBuyDay: string,
  today: string,
  kind: InstrumentKind,
): boolean {
  if (kind === 'otc_fund') return false;
  const dayDiff = calendarDateToDayjs(today).diff(calendarDateToDayjs(firstBuyDay), 'day');
  return dayDiff <= 1;
}

/** 持久化成交日：上海时区当天 0 点，带 +08:00 偏移。 */
export function tradeAtToStorage(value: Dayjs): string {
  return value.tz(TRADE_MARKET_TIMEZONE).startOf('day').format('YYYY-MM-DD[T]HH:mm:ssZ');
}

export function parseTradeAt(value: string): Dayjs {
  return dayjs(value).tz(TRADE_MARKET_TIMEZONE).startOf('day');
}

export function defaultTradeAt(): Dayjs {
  return dayjs().tz(TRADE_MARKET_TIMEZONE).startOf('day');
}

export function tradeAtToIso(value: Dayjs): string {
  return tradeAtToStorage(value);
}
