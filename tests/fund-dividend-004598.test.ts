import { describe, expect, it } from 'vitest';
import { marketService } from '../src/service/market/market-service';
import { matchDividendEvent } from '../src/service/portfolio/dividend-matcher';
import type { PortfolioLedgerEntry } from '../src/shared/portfolio/types';

function buy(tradeAt: string, quantity = 1000): PortfolioLedgerEntry {
  return {
    id: '1',
    accountId: 'default',
    symbol: '004598',
    kind: 'otc_fund',
    venue: 'OTC',
    cashOutflow: null,
    side: 'buy',
    quantity,
    price: 1.2,
    fees: 0,
    planId: null,
    note: '',
    source: 'manual',
    sipOccurrenceId: null,
    createdAt: tradeAt,
    tradeAt,
  };
}

describe('004598 fund dividend matching', () => {
  it('fetches implemented cash dividends from East Money', async () => {
    const result = await marketService.listDividends('004598', 1, 50);
    expect(result.total).toBeGreaterThan(0);
    const sample = result.items[0];
    expect(sample?.cashPerShare).toBeGreaterThan(0);
    expect(sample?.status).toBe('implemented');
    expect(sample?.exDividendDate).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
  }, 30_000);

  it('matches dividends after first buy without invalid date errors', async () => {
    const result = await marketService.listDividends('004598', 1, 50);
    const ledger = [buy('2025-01-01T00:00:00.000Z')];
    const matches = result.items.map((event) =>
      matchDividendEvent({
        accountId: 'default',
        symbol: '004598',
        kind: 'otc_fund',
        ledger,
        event,
        today: '2026-08-30',
      }),
    );
    const synced = matches.filter((item) => item.upsert);
    expect(synced.length).toBeGreaterThan(0);
  }, 30_000);
});
