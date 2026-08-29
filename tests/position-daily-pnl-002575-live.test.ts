import { describe, expect, it } from 'vitest';
import { getQuote } from '../src/service/market/eastmoney/quote-service';
import { computePositionDailyPnl, resolveDayChangePerShare } from '../src/service/portfolio/position-daily-pnl';
import type { PortfolioLedgerEntry } from '../src/shared/portfolio/types';

describe('002575 live ledger reproduction', () => {
  it('matches full market daily when an older lot exists', async () => {
    const quote = await getQuote('002575');
    const dayChange = resolveDayChangePerShare(quote, quote.price);
    const entries: PortfolioLedgerEntry[] = [
      {
        id: '1',
        accountId: 'a',
        symbol: '002575',
        kind: 'stock',
        side: 'buy',
        quantity: 800,
        price: 5.32,
        fees: 0.45,
        tradeAt: '2026-08-04T00:00:00+08:00',
        planId: null,
        note: '',
        source: 'manual',
        sipOccurrenceId: null,
        createdAt: '2026-08-29T16:44:26.431Z',
      },
      {
        id: '2',
        accountId: 'a',
        symbol: '002575',
        kind: 'stock',
        side: 'buy',
        quantity: 400,
        price: 5.35,
        fees: 0.23,
        tradeAt: '2026-08-30T00:00:00+08:00',
        planId: null,
        note: '',
        source: 'manual',
        sipOccurrenceId: null,
        createdAt: '2026-08-29T16:45:49.470Z',
      },
    ];

    const pnl = computePositionDailyPnl({
      kind: 'stock',
      entries,
      marketPrice: quote.price,
      quote,
      referenceUnrealizedPnl: -28.64,
      firstBuyAt: '2026-08-04T00:00:00+08:00',
      asOf: new Date('2026-08-30T01:39:00+08:00'),
    });

    expect(dayChange).not.toBeNull();
    expect(pnl).toBeCloseTo(1200 * (dayChange ?? 0), 1);
    expect(pnl).toBeGreaterThan(90);
  }, 30_000);
});
