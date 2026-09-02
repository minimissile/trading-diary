import { describe, expect, it } from 'vitest';
import type { PortfolioLedgerEntry } from '../src/shared/portfolio/types';
import { buildPnlCalendar, indexDailyBars } from '../src/service/portfolio/pnl-calendar';
import type { MarketDailyBar } from '../src/service/market/market-daily-bar-database';

function entry(
  partial: Partial<PortfolioLedgerEntry> & Pick<PortfolioLedgerEntry, 'symbol' | 'side' | 'quantity' | 'tradeAt'>,
): PortfolioLedgerEntry {
  return {
    id: partial.id ?? '1',
    accountId: partial.accountId ?? 'acc-1',
    venue: partial.venue ?? 'SH',
    kind: 'stock',
    price: 10,
    fees: 0,
    planId: null,
    note: '',
    source: 'manual',
    sipOccurrenceId: null,
    createdAt: partial.tradeAt,
    ...partial,
  };
}

function bar(symbol: string, tradeDate: string, close: number, prevClose: number): MarketDailyBar {
  return {
    venue: 'SH',
    symbol,
    tradeDate,
    close,
    prevClose,
    kind: 'stock',
    fetchedAt: '2026-08-01T00:00:00.000Z',
  };
}

describe('buildPnlCalendar', () => {
  it('aggregates daily position pnl from cached closes', () => {
    const ledger = [
      entry({
        id: '1',
        symbol: '600941',
        side: 'buy',
        quantity: 100,
        price: 10,
        tradeAt: '2026-08-03T00:00:00+08:00',
      }),
    ];

    const bars = indexDailyBars([
      bar('600941', '2026-08-03', 10.5, 10),
      bar('600941', '2026-08-04', 11, 10.5),
    ]);

    const result = buildPnlCalendar({
      ledger,
      dividends: [],
      barsBySymbol: bars,
      month: '2026-08',
      asOf: new Date('2026-08-30T12:00:00+08:00'),
    });

    const dayOne = result.days.find((day) => day.date === '2026-08-03');
    const dayFour = result.days.find((day) => day.date === '2026-08-04');

    expect(dayOne?.positionPnl).toBeCloseTo(50, 2);
    expect(dayFour?.positionPnl).toBeCloseTo(50, 2);
    expect(result.summary.totalPnl).toBeCloseTo(100, 2);
  });

  it('adds dividend cash on ex-dividend date', () => {
    const ledger = [
      entry({
        symbol: '600941',
        side: 'buy',
        quantity: 100,
        tradeAt: '2026-08-01T00:00:00+08:00',
      }),
    ];

    const bars = indexDailyBars([bar('600941', '2026-08-05', 10, 9.8)]);

    const result = buildPnlCalendar({
      ledger,
      dividends: [
        {
          id: 'd1',
          accountId: 'acc-1',
          symbol: '600941',
          name: '测试',
          kind: 'stock',
          exDividendDate: '2026-08-05',
          recordDate: null,
          payDate: null,
          cashPerShare: 0.1,
          eligibleQuantity: 100,
          cashAmount: 10,
          status: 'confirmed',
          source: 'manual',
          confirmedAt: null,
          createdAt: '2026-08-05T00:00:00.000Z',
          updatedAt: '2026-08-05T00:00:00.000Z',
        },
      ],
      barsBySymbol: bars,
      month: '2026-08',
      asOf: new Date('2026-08-30T12:00:00+08:00'),
    });

    const day = result.days.find((item) => item.date === '2026-08-05');
    expect(day?.dividendPnl).toBe(10);
    expect(day?.totalPnl).toBeGreaterThan(10);
  });

  it('returns zero position pnl for fund on weekend without nav change', () => {
    const ledger = [
      entry({
        symbol: '021972',
        venue: 'OTC',
        kind: 'otc_fund',
        side: 'buy',
        quantity: 100,
        tradeAt: '2026-08-01T00:00:00+08:00',
      }),
    ];

    const bars = indexDailyBars([
      {
        venue: 'OTC',
        symbol: '021972',
        tradeDate: '2026-08-30',
        close: 1.16,
        prevClose: 1.16,
        kind: 'otc_fund',
        fetchedAt: '2026-08-30T00:00:00.000Z',
      },
    ]);

    const result = buildPnlCalendar({
      ledger,
      dividends: [],
      barsBySymbol: bars,
      month: '2026-08',
      asOf: new Date('2026-08-30T12:00:00+08:00'),
    });

    const weekend = result.days.find((day) => day.date === '2026-08-30');
    expect(weekend?.positionPnl).toBe(0);
  });
});

describe('pnl calendar window', () => {
  it('limits window to one year', async () => {
    const {
      pnlCalendarWindowStart,
      pnlCalendarWindowEnd,
      isDateInPnlCalendarWindow,
      resolvePnlCalendarPanelDate,
    } = await import('../src/shared/portfolio/pnl-calendar-window');
    const asOf = new Date('2026-08-30T12:00:00+08:00');
    const start = pnlCalendarWindowStart(asOf);
    const end = pnlCalendarWindowEnd(asOf);
    expect(end).toBe('2026-08-30');
    expect(start).toBe('2025-08-30');
    expect(isDateInPnlCalendarWindow('2025-08-29', asOf)).toBe(false);
    expect(isDateInPnlCalendarWindow('2025-08-30', asOf)).toBe(true);
    expect(resolvePnlCalendarPanelDate('2025-08', start, end)).toBe('2025-08-30');
    expect(resolvePnlCalendarPanelDate('2026-08', start, end)).toBe('2026-08-01');
  });
});
