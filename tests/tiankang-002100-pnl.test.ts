import { describe, expect, it } from 'vitest';
import { estimateTradeFees } from '../src/service/accounts/fee-calculator';
import { computeExchangeTradedNetCashInvested } from '../src/service/portfolio/ledger-service';
import { computeReferenceUnrealizedPnl } from '../src/service/portfolio/reference-unrealized-pnl';
import type { PortfolioLedgerEntry } from '../src/shared/portfolio/types';

const hwabao0854Profile = {
  commissionWan: 0.854,
  commissionMinCents: 100,
  etfCommissionWan: 0.6,
  etfCommissionMinCents: 0,
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

describe('002100 天康生物 统一扣卖出费口径', () => {
  const entries: PortfolioLedgerEntry[] = [
    {
      id: '1',
      accountId: 'default',
      symbol: '002100',
      venue: 'SZ',
      kind: 'stock',
      side: 'buy',
      quantity: 400,
      price: 8.28,
      fees: 1.03,
      tradeAt: '2026-04-15T00:00:00+08:00',
      planId: null,
      note: '',
      source: 'manual',
      sipOccurrenceId: null,
      cashOutflow: null,
      createdAt: '2026-04-15T00:00:00+08:00',
    },
  ];

  it('扣预估卖出费后约 -144.4；同花顺部分账户显示毛浮盈 -141.83', () => {
    const netCash = computeExchangeTradedNetCashInvested(entries, 31.2);
    const marketValue = 400 * 7.85;
    const grossPnl = marketValue - netCash;
    expect(grossPnl).toBeCloseTo(-141.83, 2);

    const sellFees = estimateTradeFees(
      { side: 'sell', market: 'SZ', price: 7.85, quantity: 400, instrumentKind: 'stock' },
      hwabao0854Profile,
    );
    expect(sellFees.totalFees).toBeCloseTo(2.57, 2);

    const referencePnl = computeReferenceUnrealizedPnl({
      marketPrice: 7.85,
      quantity: 400,
      totalCost: netCash,
      kind: 'stock',
      market: 'SZ',
      feeProfile: hwabao0854Profile,
    });
    expect(referencePnl).toBeCloseTo(-144.4, 1);
    expect(referencePnl).toBeCloseTo(grossPnl - sellFees.totalFees, 2);
  });
});
