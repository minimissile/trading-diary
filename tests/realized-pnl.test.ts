import { describe, expect, it } from 'vitest';
import type { PortfolioLedgerEntry } from '../src/shared/portfolio/types';
import {
  buildRealizedHistory,
  computeRealizedTrades,
} from '../src/service/portfolio/realized-pnl';

function entry(
  partial: Partial<PortfolioLedgerEntry> & Pick<PortfolioLedgerEntry, 'symbol' | 'side' | 'quantity' | 'tradeAt'>,
): PortfolioLedgerEntry {
  return {
    id: partial.id ?? '1',
    accountId: partial.accountId ?? 'acc-1',
    venue: 'SH',
    kind: 'stock',
    price: 10,
    fees: 0,
    planId: null,
    note: '',
    source: 'manual',
    sipOccurrenceId: null,
    cashOutflow: null,
    createdAt: partial.tradeAt,
    ...partial,
  };
}

describe('computeRealizedTrades', () => {
  it('computes realized pnl per sell using average cost', () => {
    const trades = computeRealizedTrades([
      entry({ id: '1', symbol: '600941', side: 'buy', quantity: 200, price: 10, fees: 2, tradeAt: '2026-01-10T00:00:00+08:00' }),
      entry({ id: '2', symbol: '600941', side: 'sell', quantity: 100, price: 12, fees: 1, tradeAt: '2026-06-01T00:00:00+08:00' }),
    ]);

    expect(trades).toHaveLength(1);
    expect(trades[0]?.quantity).toBe(100);
    expect(trades[0]?.costBasis).toBeCloseTo((200 * 10 + 2) / 200 * 100, 2);
    expect(trades[0]?.realizedPnl).toBeCloseTo(100 * 12 - 1 - trades[0]!.costBasis, 2);
    expect(trades[0]?.remainingQuantity).toBe(100);
  });

  it('lists closed positions when quantity reaches zero', () => {
    const history = buildRealizedHistory([
      entry({ id: '1', symbol: '600941', side: 'buy', quantity: 100, price: 10, tradeAt: '2026-01-10T00:00:00+08:00' }),
      entry({ id: '2', symbol: '600941', side: 'sell', quantity: 100, price: 11, fees: 1, tradeAt: '2026-06-01T00:00:00+08:00' }),
    ]);

    expect(history.trades).toHaveLength(1);
    expect(history.closedPositions).toHaveLength(1);
    expect(history.closedPositions[0]?.totalRealizedPnl).toBeCloseTo(history.trades[0]!.realizedPnl, 2);
  });

  it('computes T-trading pnl for same-day buy-then-sell (000158 May 25)', () => {
    const trades = computeRealizedTrades([
      entry({ id: '1', symbol: '000158', side: 'buy', quantity: 200, price: 21.4, fees: 0.45, tradeAt: '2026-03-09T14:49:00+08:00' }),
      entry({ id: '2', symbol: '000158', side: 'buy', quantity: 100, price: 21.22, fees: 0.22, tradeAt: '2026-03-11T14:16:00+08:00' }),
      entry({ id: '4', symbol: '000158', side: 'buy', quantity: 200, price: 16.46, fees: 0.35, tradeAt: '2026-05-25T10:00:00+08:00' }),
      entry({ id: '3', symbol: '000158', side: 'sell', quantity: 200, price: 16.65, fees: 2.02, tradeAt: '2026-05-25T14:00:00+08:00' }),
      entry({ id: '5', symbol: '000158', side: 'buy', quantity: 200, price: 13.51, fees: 0.28, tradeAt: '2026-08-19T09:32:00+08:00' }),
    ]);

    const maySell = trades.find((trade) => trade.tradeAt.startsWith('2026-05-25'));
    expect(maySell?.realizedPnl).toBeCloseTo(-550.03, 2);
    expect(maySell?.tTradingPnl).toBeCloseTo(35.63, 2);
  });

  it('returns null T-trading pnl when sell has no same-day prior buy', () => {
    const trades = computeRealizedTrades([
      entry({ id: '1', symbol: '600941', side: 'buy', quantity: 200, price: 10, fees: 2, tradeAt: '2026-01-10T00:00:00+08:00' }),
      entry({ id: '2', symbol: '600941', side: 'sell', quantity: 100, price: 12, fees: 1, tradeAt: '2026-06-01T00:00:00+08:00' }),
    ]);

    expect(trades[0]?.tTradingPnl).toBeNull();
  });
});
