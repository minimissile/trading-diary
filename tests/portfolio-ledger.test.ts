import { describe, expect, it } from 'vitest';
import { aggregatePositions, snapshotQuantityAt } from '../src/service/portfolio/ledger-service';
import type { PortfolioLedgerEntry } from '../src/shared/portfolio/types';

function entry(partial: Partial<PortfolioLedgerEntry> & Pick<PortfolioLedgerEntry, 'symbol' | 'side' | 'quantity' | 'tradeAt'>): PortfolioLedgerEntry {
  return {
    id: partial.id ?? '1',
    accountId: 'default',
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

describe('portfolio ledger', () => {
  it('aggregates buy quantity and average cost', () => {
    const positions = aggregatePositions([
      entry({ id: '1', symbol: '600941', side: 'buy', quantity: 100, price: 10, tradeAt: '2026-01-10T00:00:00.000Z' }),
      entry({ id: '2', symbol: '600941', side: 'buy', quantity: 100, price: 12, tradeAt: '2026-02-10T00:00:00.000Z' }),
    ]);
    expect(positions).toHaveLength(1);
    expect(positions[0]?.quantity).toBe(200);
    expect(positions[0]?.avgPrice).toBe(11);
    expect(positions[0]?.avgCost).toBe(11);
  });

  it('tracks execution price separately from amortized cost with fees', () => {
    const positions = aggregatePositions([
      entry({
        id: '1',
        symbol: '601519',
        side: 'buy',
        quantity: 600,
        price: 8.77,
        fees: 5.05,
        tradeAt: '2026-08-28T00:00:00.000Z',
      }),
    ]);
    expect(positions[0]?.avgPrice).toBe(8.77);
    expect(positions[0]?.totalCost).toBeCloseTo(5267.05, 2);
    expect(positions[0]?.avgCost).toBeCloseTo(5267.05 / 600, 4);
  });

  it('reduces quantity on sell using average cost', () => {
    const positions = aggregatePositions([
      entry({ id: '1', symbol: '600941', side: 'buy', quantity: 200, price: 10, tradeAt: '2026-01-10T00:00:00.000Z' }),
      entry({ id: '2', symbol: '600941', side: 'sell', quantity: 100, price: 11, tradeAt: '2026-06-01T00:00:00.000Z' }),
    ]);
    expect(positions[0]?.quantity).toBe(100);
    expect(positions[0]?.avgPrice).toBe(10);
    expect(positions[0]?.avgCost).toBe(10);
  });

  it('snapshots quantity at record date', () => {
    const ledger = [
      entry({ id: '1', symbol: '600941', side: 'buy', quantity: 200, tradeAt: '2026-03-10T00:00:00.000Z' }),
      entry({ id: '2', symbol: '600941', side: 'sell', quantity: 100, tradeAt: '2026-08-01T00:00:00.000Z' }),
    ];
    expect(snapshotQuantityAt(ledger, '2026-06-04')).toBe(200);
    expect(snapshotQuantityAt(ledger, '2026-08-26')).toBe(100);
  });
});
