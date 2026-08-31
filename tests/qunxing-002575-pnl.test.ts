import { describe, expect, it } from 'vitest';
import { estimateTradeFees } from '../src/service/accounts/fee-calculator';
import { computeReferenceUnrealizedPnl } from '../src/service/portfolio/reference-unrealized-pnl';

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

describe('002575 群兴玩具 湘财证券 vs 同花顺', () => {
  it('现价 5.51 扣卖出费后浮盈 211.21，对齐同花顺', () => {
    const quantity = 1200;
    const marketPrice = 5.51;
    const totalCost = 800 * 5.32 + 0.45 + 400 * 5.35 + 0.23;
    const grossPnl = quantity * marketPrice - totalCost;
    expect(grossPnl).toBeCloseTo(215.32, 2);

    const sellFees = estimateTradeFees(
      { side: 'sell', market: 'SZ', price: marketPrice, quantity, instrumentKind: 'stock' },
      xiangcaiProfile,
    );
    expect(sellFees.totalFees).toBeCloseTo(4.11, 2);

    const pnl = computeReferenceUnrealizedPnl({
      marketPrice,
      quantity,
      totalCost,
      kind: 'stock',
      market: 'SZ',
      feeProfile: xiangcaiProfile,
    });
    expect(pnl).toBeCloseTo(211.21, 2);
    expect(pnl).toBeCloseTo(grossPnl - sellFees.totalFees, 2);
  });
});
