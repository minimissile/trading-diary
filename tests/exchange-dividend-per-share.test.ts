import { describe, expect, it } from 'vitest';
import { exchangePretaxBonusToCashPerShare } from '../src/service/market/eastmoney/dividend-service';
import { matchDividendEvent } from '../src/service/portfolio/dividend-matcher';
import type { PortfolioLedgerEntry } from '../src/shared/portfolio/types';
import type { DividendEvent } from '../src/shared/market/types';

describe('exchange dividend per-share conversion', () => {
  it('converts East Money pretax bonus per 10 shares to per-share amount', () => {
    expect(exchangePretaxBonusToCashPerShare(0.27)).toBeCloseTo(0.027, 6);
    expect(exchangePretaxBonusToCashPerShare(2)).toBeCloseTo(0.2, 6);
  });

  it('matches 000158 cash dividend of 8.10 for 300 eligible shares', () => {
    const ledger: PortfolioLedgerEntry[] = [
      {
        id: '1',
        accountId: 'default',
        symbol: '000158',
        kind: 'stock',
        side: 'buy',
        quantity: 200,
        price: 21.4,
        fees: 0,
        planId: null,
        note: '',
        source: 'manual',
        sipOccurrenceId: null,
        tradeAt: '2026-03-09T00:00:00.000Z',
        createdAt: '2026-03-09T00:00:00.000Z',
      },
      {
        id: '2',
        accountId: 'default',
        symbol: '000158',
        kind: 'stock',
        side: 'buy',
        quantity: 100,
        price: 21.22,
        fees: 0,
        planId: null,
        note: '',
        source: 'manual',
        sipOccurrenceId: null,
        tradeAt: '2026-03-11T00:00:00.000Z',
        createdAt: '2026-03-11T00:00:00.000Z',
      },
    ];

    const event: DividendEvent = {
      symbol: '000158',
      planText: '10派0.27元(含税,扣税后0.243元)',
      cashPerShare: exchangePretaxBonusToCashPerShare(0.27),
      status: 'implemented',
      progress: '实施',
      reportDate: null,
      noticeDate: null,
      recordDate: '2026-06-08',
      exDividendDate: '2026-06-09',
      payDate: null,
      daysToExDividend: null,
      source: 'eastmoney',
    };

    const result = matchDividendEvent({
      accountId: 'default',
      symbol: '000158',
      kind: 'stock',
      ledger,
      event,
      today: '2026-08-30',
    });

    expect(result.upsert?.eligibleQuantity).toBe(300);
    expect(result.upsert?.cashAmount).toBeCloseTo(8.1, 2);
    expect(result.upsert?.cashPerShare).toBeCloseTo(0.027, 6);
  });
});
