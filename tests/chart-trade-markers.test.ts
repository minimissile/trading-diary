import { describe, expect, it } from 'vitest';
import {
  alignTradeTimestamp,
  buildChartTradeMarkers,
  prepareTradeMarkersForBars,
  spreadOverlappingMarkerPrices,
} from '../src/shared/chart/trade-markers';
import type { PortfolioLedgerEntry } from '../src/shared/portfolio/types';

function entry(partial: Partial<PortfolioLedgerEntry> & Pick<PortfolioLedgerEntry, 'id' | 'side' | 'tradeAt'>): PortfolioLedgerEntry {
  return {
    accountId: 'acc-1',
    symbol: '002387',
    venue: 'SZ',
    kind: 'stock',
    quantity: 500,
    price: 7.32,
    fees: 0.47,
    planId: null,
    note: '',
    source: 'manual',
    sipOccurrenceId: null,
    cashOutflow: null,
    createdAt: partial.tradeAt,
    ...partial,
  };
}

describe('chart trade markers', () => {
  it('aligns daily trades to China calendar day start', () => {
    const ts = alignTradeTimestamp('2026-08-28T14:30:00+08:00', '1d');
    expect(ts).toBe(Date.UTC(2026, 7, 28) - 8 * 60 * 60 * 1000);
  });

  it('builds buy sell and dividend reinvest markers', () => {
    const markers = buildChartTradeMarkers(
      [
        entry({ id: '1', side: 'buy', tradeAt: '2026-08-20T10:00:00+08:00' }),
        entry({ id: '2', side: 'sell', tradeAt: '2026-08-25T11:00:00+08:00', source: 'sip' }),
        entry({ id: '3', side: 'dividend_reinvest', tradeAt: '2026-08-26T00:00:00+08:00', source: 'plan' }),
      ],
      '1d',
    );

    expect(markers).toHaveLength(3);
    expect(markers.map((marker) => marker.label)).toEqual(['B', 'S', '再']);
    expect(markers[1]?.placement).toBe('above');
    expect(markers[0]?.tooltip).toContain('买入');
    expect(markers[1]?.tooltip).toContain('定投');
  });

  it('spreads overlapping markers on the same bar', () => {
    const base = buildChartTradeMarkers(
      [
        entry({ id: '1', side: 'buy', tradeAt: '2026-08-20T10:00:00+08:00', price: 10 }),
        entry({ id: '2', side: 'buy', tradeAt: '2026-08-20T15:00:00+08:00', price: 10 }),
      ],
      '1d',
    );
    const spread = spreadOverlappingMarkerPrices(base);
    expect(spread[0]?.price).not.toBe(spread[1]?.price);
  });

  it('snaps markers onto loaded bars', () => {
    const markers = buildChartTradeMarkers(
      [entry({ id: '1', side: 'buy', tradeAt: '2026-08-28T14:30:00+08:00' })],
      '1d',
    );
    const day = Date.UTC(2026, 7, 28) - 8 * 60 * 60 * 1000;
    const bars = [
      { timestamp: day - 86_400_000, open: 1, high: 1, low: 1, close: 1, volume: 0, turnover: 0 },
      { timestamp: day, open: 1, high: 1, low: 1, close: 1, volume: 0, turnover: 0 },
    ];
    const prepared = prepareTradeMarkersForBars(markers, bars);
    expect(prepared[0]?.timestamp).toBe(bars[1]?.timestamp);
  });
});
