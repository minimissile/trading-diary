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
 * 同花顺「当日参考盈亏」：建仓当日/上一自然日，或周末查看前一交易日建仓时，日收益等于参考浮盈。
 */
export function shouldUseReferenceDailyPnl(
  firstBuyDay: string,
  today: string,
  kind: InstrumentKind,
): boolean {
  if (kind === 'otc_fund') return false;
  const dayDiff = calendarDateToDayjs(today).diff(calendarDateToDayjs(firstBuyDay), 'day');
  if (dayDiff <= 1) return true;
  if (dayDiff <= 2 && !isTradingDay(today)) return true;
  return false;
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
