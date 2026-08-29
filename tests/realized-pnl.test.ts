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
});
