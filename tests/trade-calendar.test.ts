import { describe, expect, it } from 'vitest';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import {
  defaultTradeAt,
  isTradingDay,
  countTradingDaysInclusive,
  shouldUseReferenceDailyPnl,
  shouldCountOtcFundDailyPnl,
  parseTradeAt,
  todayCalendarDate,
  tradeAtToStorage,
  tradeCalendarDate,
} from '../src/shared/trade-calendar';

dayjs.extend(utc);
dayjs.extend(timezone);

describe('trade calendar', () => {
  it('stores trade date at Shanghai midnight', () => {
    const stored = tradeAtToStorage(dayjs.tz('2026-08-29', 'Asia/Shanghai'));
    expect(stored).toBe('2026-08-29T00:00:00+08:00');
  });

  it('reads legacy UTC tradeAt as Shanghai calendar date', () => {
    expect(tradeCalendarDate('2026-08-28T16:00:00.000Z')).toBe('2026-08-29');
    expect(tradeCalendarDate('2026-08-27T16:00:00.000Z')).toBe('2026-08-28');
  });

  it('uses Shanghai calendar for today', () => {
    expect(todayCalendarDate(new Date('2026-08-29T15:22:00.000Z'))).toBe('2026-08-29');
  });

  it('parses stored tradeAt without keeping time component', () => {
    const parsed = parseTradeAt('2026-08-29T00:00:00+08:00');
    expect(parsed.format('YYYY-MM-DD HH:mm Z')).toBe('2026-08-29 00:00 +08:00');
  });

  it('defaults to today at Shanghai start of day', () => {
    const today = defaultTradeAt();
    expect(today.format('YYYY-MM-DD')).toBe(
      dayjs().tz('Asia/Shanghai').startOf('day').format('YYYY-MM-DD'),
    );
  });

  it('detects trading days and weekend has no reference daily window', () => {
    expect(isTradingDay('2026-08-28')).toBe(true);
    expect(isTradingDay('2026-08-30')).toBe(false);
    expect(countTradingDaysInclusive('2026-08-28', '2026-08-30')).toBe(1);
    expect(shouldUseReferenceDailyPnl('2026-08-28', '2026-08-30', 'stock')).toBe(false);
    expect(shouldUseReferenceDailyPnl('2026-08-28', '2026-08-29', 'stock')).toBe(true);
  });

  it('counts otc fund daily pnl on trading days and weekend nav updates only', () => {
    expect(shouldCountOtcFundDailyPnl({ date: '2026-08-28' })).toBe(true);
    expect(
      shouldCountOtcFundDailyPnl({
        date: '2026-08-30',
        navDate: '2026-08-28',
        close: 1.1611,
        prevClose: 1.1491,
      }),
    ).toBe(false);
    expect(
      shouldCountOtcFundDailyPnl({
        date: '2026-08-30',
        navDate: '2026-08-30',
        close: 1.0002,
        prevClose: 1,
      }),
    ).toBe(true);
    expect(
      shouldCountOtcFundDailyPnl({
        date: '2026-08-30',
        close: 1.1611,
        prevClose: 1.1611,
      }),
    ).toBe(false);
  });
});
