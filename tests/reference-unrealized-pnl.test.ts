import { describe, expect, it } from 'vitest';
import { FEE_PROFILE_A_SHARE_STANDARD } from '../src/shared/accounts/fee-presets';
import {
  computeReferenceUnrealizedPnl,
  computeReferenceReturnPercent,
  inferMarketFromSymbol,
} from '../src/service/portfolio/reference-unrealized-pnl';

const xiangcaiProfile = {
  commissionWan: 1.054,
  commissionMinCents: 0,
  etfCommissionWan: null,
  etfCommissionMinCents: null,
  etfShCommissionWan: null,
  etfShCommissionMinCents: null,
  etfSzCommissionWan: null,
  etfSzCommissionMinCents: null,
  hkCommissionWan: null,
  hkCommissionMinCents: null,
  usCommissionWan: null,
  usCommissionMinCents: null,
  usCommissionPerShare: null,
  stampDutyRatePpm: 500,
  transferFeeRatePpm: 10,
  transferFeeMinCents: 0,
  otherFeeCents: 0,
};

describe('inferMarketFromSymbol', () => {
  it('detects Shanghai A-shares', () => {
    expect(inferMarketFromSymbol('601519')).toBe('SH');
  });

  it('detects Shenzhen A-shares', () => {
    expect(inferMarketFromSymbol('002387')).toBe('SZ');
  });
});

describe('computeReferenceUnrealizedPnl', () => {
  it('matches Tonghuashun reference PnL for 601519 (SH, wan 2.5)', () => {
    const quantity = 600;
    const marketPrice = 8.9;
    const totalCost = quantity * 8.77 + 5.05;

    const pnl = computeReferenceUnrealizedPnl({
      marketPrice,
      quantity,
      totalCost,
      kind: 'stock',
      market: 'SH',
      feeProfile: FEE_PROFILE_A_SHARE_STANDARD,
    });

    expect(pnl).toBeCloseTo(65.23, 2);
    expect(computeReferenceReturnPercent(pnl, totalCost)).toBeCloseTo(1.238, 2);
  });

  it('matches Tonghuashun reference PnL for 002387 (SZ, wan 1.054)', () => {
    const pnl = computeReferenceUnrealizedPnl({
      marketPrice: 7.32,
      quantity: 500,
      totalCost: 500 * 9.01 + 0.47,
      kind: 'stock',
      market: 'SZ',
      feeProfile: xiangcaiProfile,
    });

    expect(pnl).toBeCloseTo(-847.79, 2);
  });

  it('matches Tonghuashun reference PnL for 002575 (SZ, wan 1.054, two buys)', () => {
    const pnl = computeReferenceUnrealizedPnl({
      marketPrice: 5.31,
      quantity: 1200,
      totalCost: 800 * 5.32 + 0.45 + 400 * 5.35 + 0.23,
      kind: 'stock',
      market: 'SZ',
      feeProfile: xiangcaiProfile,
    });

    expect(pnl).toBeCloseTo(-28.64, 2);
  });

  it('deducts estimated sell fees for Shenzhen holdings with standard profile', () => {
    const quantity = 500;
    const marketPrice = 7.32;
    const totalCost = quantity * 9.01 + 0.47;
    const gross = quantity * marketPrice - totalCost;

    const pnl = computeReferenceUnrealizedPnl({
      marketPrice,
      quantity,
      totalCost,
      kind: 'stock',
      market: 'SZ',
      feeProfile: FEE_PROFILE_A_SHARE_STANDARD,
    });

    expect(pnl).toBeLessThan(gross);
    expect(gross - pnl).toBeCloseTo(6.83, 2);
  });

  it('leaves OTC fund reference PnL as gross PnL without A-share sell fees', () => {
    const quantity = 1053.1;
    const marketPrice = 0.6214;
    const totalCost = quantity * 0.6647;

    const pnl = computeReferenceUnrealizedPnl({
      marketPrice,
      quantity,
      totalCost,
      kind: 'otc_fund',
      market: null,
      feeProfile: FEE_PROFILE_A_SHARE_STANDARD,
    });

    expect(pnl).toBe(-45.6);
  });
});
