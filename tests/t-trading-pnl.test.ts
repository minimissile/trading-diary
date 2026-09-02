import { describe, expect, it } from 'vitest';
import { computeTTradingPnlForSell, createTBuyLot } from '../src/service/portfolio/t-trading-pnl';
import type { PortfolioLedgerEntry } from '../src/shared/portfolio/types';

function sellEntry(partial: Partial<PortfolioLedgerEntry>): PortfolioLedgerEntry {
  return {
    id: 'sell',
    accountId: 'acc',
    symbol: '000158',
    venue: 'SZ',
    kind: 'stock',
    side: 'sell',
    quantity: 200,
    price: 16.65,
    fees: 2.02,
    tradeAt: '2026-05-25T14:00:00+08:00',
    planId: null,
    note: '',
    source: 'manual',
    sipOccurrenceId: null,
    cashOutflow: null,
    createdAt: '2026-05-25T14:00:00+08:00',
    ...partial,
  };
}

describe('computeTTradingPnlForSell', () => {
  it('pairs LIFO with same-day buys before sell', () => {
    const buy = createTBuyLot(
      {
        id: 'buy',
        accountId: 'acc',
        symbol: '000158',
        venue: 'SZ',
        kind: 'stock',
        side: 'buy',
        quantity: 200,
        price: 16.46,
        fees: 0.35,
        tradeAt: '2026-05-25T10:00:00+08:00',
        planId: null,
        note: '',
        source: 'manual',
        sipOccurrenceId: null,
        cashOutflow: null,
        createdAt: '2026-05-25T10:00:00+08:00',
      },
      200,
    );

    const pnl = computeTTradingPnlForSell(sellEntry({}), 200, [buy]);
    expect(pnl).toBeCloseTo(35.63, 2);
  });
});
