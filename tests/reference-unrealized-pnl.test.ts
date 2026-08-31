import { describe, expect, it } from 'vitest';
import type { PortfolioLedgerEntry } from '../src/shared/portfolio/types';
import { FEE_PROFILE_A_SHARE_STANDARD } from '../src/shared/accounts/fee-presets';
import { computeExchangeTradedNetCashInvested } from '../src/service/portfolio/ledger-service';
import {
  computeReferenceUnrealizedPnl,
  computeReferenceReturnPercent,
  inferMarketFromSymbol,
} from '../src/service/portfolio/reference-unrealized-pnl';

function ledgerEntry(
  partial: Partial<PortfolioLedgerEntry> & Pick<PortfolioLedgerEntry, 'side' | 'quantity' | 'price' | 'tradeAt'>,
): PortfolioLedgerEntry {
  return {
    id: partial.id ?? '1',
    accountId: 'default',
    symbol: '000158',
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
  it('matches reference PnL with sell fees for 601519 (SH, wan 2.5)', () => {
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

  it('matches reference PnL with sell fees for 002387 (SZ, wan 1.054)', () => {
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

  it('matches reference PnL with sell fees for 002575 (SZ, wan 1.054, two buys)', () => {
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

  it('matches reference PnL with sell fees for 000158 after partial sell', () => {
    const entries = [
      ledgerEntry({ id: '1', side: 'buy', quantity: 200, price: 21.4, fees: 0.45, tradeAt: '2026-03-09T14:49:00+08:00' }),
      ledgerEntry({ id: '2', side: 'buy', quantity: 100, price: 21.22, fees: 0.22, tradeAt: '2026-03-11T14:16:00+08:00' }),
      ledgerEntry({ id: '3', side: 'sell', quantity: 200, price: 16.65, fees: 2.02, tradeAt: '2026-05-25T13:19:00+08:00' }),
      ledgerEntry({ id: '4', side: 'buy', quantity: 200, price: 16.46, fees: 0.35, tradeAt: '2026-05-25T14:21:00+08:00' }),
      ledgerEntry({ id: '5', side: 'buy', quantity: 200, price: 13.51, fees: 0.28, tradeAt: '2026-08-19T09:32:00+08:00' }),
    ];
    const netCash = computeExchangeTradedNetCashInvested(entries, 8.1);

    expect(netCash).toBeCloseTo(9061.22, 2);

    const pnl = computeReferenceUnrealizedPnl({
      marketPrice: 12.61,
      quantity: 500,
      totalCost: netCash,
      kind: 'stock',
      market: 'SZ',
      feeProfile: xiangcaiProfile,
    });

    expect(pnl).toBeCloseTo(-2760.13, 1);
    expect(computeReferenceReturnPercent(pnl, netCash)).toBeCloseTo(-30.46, 1);
  });
});
