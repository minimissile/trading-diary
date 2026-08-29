import { describe, expect, it } from 'vitest';
import type { PortfolioLedgerEntry } from '../src/shared/portfolio/types';
import { FEE_PROFILE_A_SHARE_STANDARD } from '../src/shared/accounts/fee-presets';
import { computeReferenceUnrealizedPnl } from '../src/service/portfolio/reference-unrealized-pnl';
import {
  computePositionDailyPnl,
  resolveDayChangePerShare,
  sumDailyPnl,
} from '../src/service/portfolio/position-daily-pnl';

function entry(
  partial: Partial<PortfolioLedgerEntry> & Pick<PortfolioLedgerEntry, 'side' | 'quantity' | 'price' | 'tradeAt'>,
): PortfolioLedgerEntry {
  return {
    id: partial.id ?? '1',
    accountId: 'default',
    symbol: '601519',
    kind: 'stock',
    fees: 0,
    planId: null,
    note: '',
    source: 'manual',
    sipOccurrenceId: null,
    createdAt: partial.tradeAt,
    ...partial,
  };
}

describe('resolveDayChangePerShare', () => {
  it('prefers price minus prevClose when prevClose is plausible', () => {
    expect(
      resolveDayChangePerShare(
        { change: -0.0222, changePercent: 2.95, price: 7.32, prevClose: 7.11 },
        7.32,
      ),
    ).toBeCloseTo(0.21, 2);
  });

  it('derives move from change percent when prevClose is unreliable', () => {
    expect(
      resolveDayChangePerShare(
        { change: -0.0222, changePercent: 2.95, price: 7.32, prevClose: 140821225.99 },
        7.32,
      ),
    ).toBeCloseTo(0.21, 2);
  });

  it('derives fund daily move from change percent when nav is flat', () => {
    expect(
      resolveDayChangePerShare(
        { change: null, changePercent: 1.05, price: 1.1611, prevClose: 1.1611 },
        1.1611,
      ),
    ).toBeCloseTo((1.1611 * 1.05) / 101.05, 4);
  });
});

describe('position daily pnl', () => {
  it('matches Tonghuashun reference daily for 601519 on first hold day', () => {
    const quantity = 600;
    const totalCost = quantity * 8.77 + 5.05;
    const referenceUnrealized = computeReferenceUnrealizedPnl({
      marketPrice: 8.9,
      quantity,
      totalCost,
      kind: 'stock',
      market: 'SH',
      feeProfile: FEE_PROFILE_A_SHARE_STANDARD,
    });

    const pnl = computePositionDailyPnl({
      kind: 'stock',
      entries: [entry({ side: 'buy', quantity, price: 8.77, fees: 5.05, tradeAt: '2026-08-28T00:00:00+08:00' })],
      marketPrice: 8.9,
      quote: { change: 0.08, changePercent: 0.91, price: 8.9, prevClose: 8.82 },
      referenceUnrealizedPnl: referenceUnrealized,
      firstBuyAt: '2026-08-28T00:00:00+08:00',
      asOf: new Date('2026-08-29T15:22:00+08:00'),
    });

    expect(referenceUnrealized).toBeCloseTo(65.23, 2);
    expect(pnl).toBeCloseTo(65.23, 2);
  });

  it('uses reference unrealized on weekend for position bought previous trading day', () => {
    const quantity = 600;
    const totalCost = quantity * 8.77 + 5.05;
    const referenceUnrealized = computeReferenceUnrealizedPnl({
      marketPrice: 8.9,
      quantity,
      totalCost,
      kind: 'stock',
      market: 'SH',
      feeProfile: FEE_PROFILE_A_SHARE_STANDARD,
    });

    const pnl = computePositionDailyPnl({
      kind: 'stock',
      entries: [entry({ side: 'buy', quantity, price: 8.77, fees: 5.05, tradeAt: '2026-08-28T00:00:00+08:00' })],
      marketPrice: 8.9,
      quote: { change: 0.08, changePercent: 0.91, price: 8.9, prevClose: 8.82 },
      referenceUnrealizedPnl: referenceUnrealized,
      firstBuyAt: '2026-08-28T00:00:00+08:00',
      asOf: new Date('2026-08-30T01:00:00+08:00'),
    });

    expect(pnl).toBeCloseTo(65.23, 2);
  });

  it('uses market move for stock held before yesterday', () => {
    const pnl = computePositionDailyPnl({
      kind: 'stock',
      entries: [entry({ side: 'buy', quantity: 600, price: 8.79, tradeAt: '2026-08-25T00:00:00+08:00' })],
      marketPrice: 8.9,
      quote: { change: 0.08, changePercent: 0.91, price: 8.9, prevClose: 8.82 },
      referenceUnrealizedPnl: 50,
      firstBuyAt: '2026-08-25T00:00:00+08:00',
      asOf: new Date('2026-08-29T15:22:00+08:00'),
    });
    expect(pnl).toBeCloseTo(48, 2);
  });

  it('matches Tonghuashun daily reference for 002575 with multiple buys', () => {
    const pnl = computePositionDailyPnl({
      kind: 'stock',
      entries: [
        entry({ id: '1', symbol: '002575', side: 'buy', quantity: 800, price: 5.32, fees: 0.45, tradeAt: '2026-08-20T00:00:00+08:00' }),
        entry({ id: '2', symbol: '002575', side: 'buy', quantity: 400, price: 5.35, fees: 0.23, tradeAt: '2026-08-28T00:00:00+08:00' }),
      ],
      marketPrice: 5.31,
      quote: { change: 0.09, changePercent: 1.724, price: 5.31, prevClose: 5.22 },
      referenceUnrealizedPnl: -28.64,
      firstBuyAt: '2026-08-20T00:00:00+08:00',
      asOf: new Date('2026-08-30T01:00:00+08:00'),
    });
    expect(pnl).toBeCloseTo(1200 * 0.09, 1);
  });

  it('matches Tonghuashun daily reference for 002387', () => {
    const pnl = computePositionDailyPnl({
      kind: 'stock',
      entries: [entry({ symbol: '002387', side: 'buy', quantity: 500, price: 9.01, fees: 0.47, tradeAt: '2026-07-01T00:00:00+08:00' })],
      marketPrice: 7.32,
      quote: { change: 0.21, changePercent: 2.95, price: 7.32, prevClose: 7.11 },
      referenceUnrealizedPnl: -847.79,
      firstBuyAt: '2026-07-01T00:00:00+08:00',
      asOf: new Date('2026-08-30T01:00:00+08:00'),
    });
    expect(pnl).toBeCloseTo(105, 0);
  });

  it('uses buy price for shares purchased today (Shanghai calendar, UTC runtime)', () => {
    const pnl = computePositionDailyPnl({
      kind: 'stock',
      entries: [entry({ side: 'buy', quantity: 600, price: 8.79, tradeAt: '2026-08-28T16:00:00.000Z' })],
      marketPrice: 8.90358,
      quote: { change: 0.08, changePercent: 0.91, price: 8.90358, prevClose: 8.82 },
      referenceUnrealizedPnl: 68.15,
      firstBuyAt: '2026-08-28T16:00:00.000Z',
      asOf: new Date('2026-08-29T15:22:00.000Z'),
    });
    expect(pnl).toBeCloseTo(68.15, 1);
  });

  it('uses full market move when adding shares on a later day', () => {
    const pnl = computePositionDailyPnl({
      kind: 'stock',
      entries: [
        entry({ id: '1', side: 'buy', quantity: 400, price: 8.5, tradeAt: '2026-08-25T00:00:00+08:00' }),
        entry({ id: '2', side: 'buy', quantity: 200, price: 8.79, tradeAt: '2026-08-29T00:00:00+08:00' }),
      ],
      marketPrice: 8.9,
      quote: { change: 0.08, changePercent: 0.91, price: 8.9, prevClose: 8.82 },
      referenceUnrealizedPnl: 100,
      firstBuyAt: '2026-08-25T00:00:00+08:00',
      asOf: new Date('2026-08-29T15:22:00+08:00'),
    });
    expect(pnl).toBeCloseTo(600 * 0.08, 2);
  });

  it('computes fund daily pnl from nav change when published nav differs', () => {
    const pnl = computePositionDailyPnl({
      kind: 'otc_fund',
      entries: [
        entry({
          symbol: '021972',
          kind: 'otc_fund',
          side: 'buy',
          quantity: 87.03,
          price: 1.149,
          tradeAt: '2026-08-20T00:00:00.000Z',
        }),
      ],
      marketPrice: 1.1611,
      quote: { change: null, changePercent: 1.05, price: 1.1611, prevClose: 1.1491 },
      asOf: new Date('2026-08-29T12:00:00+08:00'),
    });
    expect(pnl).toBeCloseTo(87.03 * (1.1611 - 1.1491), 2);
  });

  it('computes fund daily pnl from change percent when nav is flat', () => {
    const pnl = computePositionDailyPnl({
      kind: 'otc_fund',
      entries: [
        entry({
          symbol: '012349',
          kind: 'otc_fund',
          side: 'buy',
          quantity: 1053.1,
          price: 0.6647,
          tradeAt: '2026-08-20T00:00:00.000Z',
        }),
      ],
      marketPrice: 0.6214,
      quote: { change: null, changePercent: -0.35, price: 0.6214, prevClose: 0.6214 },
      asOf: new Date('2026-08-29T12:00:00+08:00'),
    });
    expect(pnl).toBeCloseTo(1053.1 * ((0.6214 * -0.35) / 99.65), 2);
  });

  it('returns null when market daily is required but quote data is insufficient', () => {
    expect(
      computePositionDailyPnl({
        kind: 'stock',
        entries: [entry({ side: 'buy', quantity: 100, price: 10, tradeAt: '2026-08-25T00:00:00+08:00' })],
        marketPrice: 10.5,
        quote: { change: null, changePercent: null, price: null, prevClose: null },
        asOf: new Date('2026-08-29T12:00:00+08:00'),
      }),
    ).toBeNull();
  });

  it('sums daily pnl ignoring null entries', () => {
    expect(sumDailyPnl([120, null, -30])).toBe(90);
  });
});
