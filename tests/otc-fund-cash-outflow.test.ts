import { describe, expect, it } from 'vitest';
import { computeOtcFundHoldMetrics } from '../src/service/portfolio/ledger-service';
import {
  inferOtcTradeCashOutflow,
  resolveOtcBuyCashOutflow,
} from '../src/service/portfolio/otc-fund-cash-outflow';
import { computeReferenceUnrealizedPnl } from '../src/service/portfolio/reference-unrealized-pnl';
import { FEE_PROFILE_A_SHARE_STANDARD } from '../src/shared/accounts/fee-presets';
import type { PortfolioLedgerEntry } from '../src/shared/portfolio/types';

function otcBuy(
  tradeAt: string,
  quantity: number,
  price: number,
  fees: number,
  cashOutflow: number | null = null,
): PortfolioLedgerEntry {
  return {
    id: tradeAt,
    accountId: 'default',
    symbol: '161226',
    kind: 'otc_fund',
    venue: 'OTC',
    side: 'buy',
    quantity,
    price,
    fees,
    cashOutflow,
    planId: null,
    note: '',
    source: 'manual',
    sipOccurrenceId: null,
    createdAt: tradeAt,
    tradeAt,
  };
}

describe('otc fund cash outflow', () => {
  it('infers round deduction tiers when net cost is close to 100', () => {
    expect(resolveOtcBuyCashOutflow(otcBuy('2026-01-20', 38.28, 2.6059, 0.1))).toBe(100);
    expect(inferOtcTradeCashOutflow({
      amount: 100,
      amountIsNetConfirmed: false,
      quantity: 39.77,
      price: 2.512,
      fees: 0.1,
    })).toBe(100);
  });

  it('matches Ant Fortune hold metrics for 161226 with explicit cash outflows', () => {
    const entries = [
      otcBuy('2026-01-19T14:39:54+08:00', 39.77, 2.512, 0.1, 100),
      otcBuy('2026-01-20T10:49:48+08:00', 38.28, 2.6059, 0.1, 100),
      otcBuy('2026-01-21T10:43:04+08:00', 38.45, 2.598, 0.1, 100),
    ];
    const hold = computeOtcFundHoldMetrics(entries, 0);
    const nav = 1.9029;

    expect(hold.holdPrice).toBeCloseTo(2.5751, 4);
    expect(hold.totalCost).toBeCloseTo(300, 2);

    const pnl = computeReferenceUnrealizedPnl({
      marketPrice: nav,
      quantity: 116.5,
      totalCost: hold.totalCost,
      kind: 'otc_fund',
      market: 'OTC',
      feeProfile: FEE_PROFILE_A_SHARE_STANDARD,
    });

    expect(116.5 * nav).toBeCloseTo(221.69, 2);
    expect(pnl).toBeCloseTo(-78.31, 2);
  });
});
