import { describe, expect, it } from 'vitest';
import { matchDividendEvent } from '../src/service/portfolio/dividend-matcher';
import type { PortfolioLedgerEntry } from '../src/shared/portfolio/types';
import type { DividendEvent } from '../src/shared/market/types';

function entry(partial: Partial<PortfolioLedgerEntry> & Pick<PortfolioLedgerEntry, 'tradeAt'>): PortfolioLedgerEntry {
  return {
    id: '1',
    accountId: 'default',
    symbol: '600941',
    kind: 'stock',
    side: 'buy',
    quantity: 200,
    price: 10,
    fees: 0,
    planId: null,
    note: '',
    source: 'manual',
    createdAt: partial.tradeAt,
    ...partial,
  };
}

function event(partial: Partial<DividendEvent>): DividendEvent {
  return {
    symbol: '600941',
    planText: '10派2元',
    cashPerShare: 2,
    status: 'implemented',
    progress: '实施',
    reportDate: null,
    noticeDate: null,
    recordDate: '2026-06-04',
    exDividendDate: '2026-06-05',
    payDate: null,
    daysToExDividend: null,
    source: 'eastmoney',
    ...partial,
  };
}

describe('dividend matcher', () => {
  it('skips dividends before first buy', () => {
    const result = matchDividendEvent({
      accountId: 'default',
      symbol: '600941',
      kind: 'stock',
      ledger: [entry({ tradeAt: '2026-06-10T00:00:00.000Z' })],
      event: event({}),
      today: '2026-06-20',
    });
    expect(result.upsert).toBeNull();
  });

  it('creates dividend record for eligible holding', () => {
    const result = matchDividendEvent({
      accountId: 'default',
      symbol: '600941',
      kind: 'stock',
      ledger: [entry({ tradeAt: '2026-03-10T00:00:00.000Z' })],
      event: event({}),
      today: '2026-06-20',
    });
    expect(result.upsert?.cashAmount).toBe(400);
    expect(result.upsert?.eligibleQuantity).toBe(200);
    expect(result.upsert?.status).toBe('confirmed');
  });
});
