import { describe, expect, it } from 'vitest';
import { FEE_PROFILE_A_SHARE_STANDARD } from '../src/shared/accounts/fee-presets';
import { estimateTradeFees } from '../src/service/accounts/fee-calculator';

describe('estimateTradeFees', () => {
  const profile = {
    commissionWan: FEE_PROFILE_A_SHARE_STANDARD.commissionWan,
    commissionMinCents: FEE_PROFILE_A_SHARE_STANDARD.commissionMinCents,
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
    stampDutyRatePpm: FEE_PROFILE_A_SHARE_STANDARD.stampDutyRatePpm,
    transferFeeRatePpm: FEE_PROFILE_A_SHARE_STANDARD.transferFeeRatePpm,
    transferFeeMinCents: FEE_PROFILE_A_SHARE_STANDARD.transferFeeMinCents,
    otherFeeCents: FEE_PROFILE_A_SHARE_STANDARD.otherFeeCents,
  };

  it('applies minimum commission for small trades', () => {
    const result = estimateTradeFees(
      { side: 'buy', market: 'SZ', price: 10, quantity: 100 },
      profile,
    );
    expect(result.commission).toBe(5);
    expect(result.stampDuty).toBe(0);
    expect(result.transferFee).toBe(0);
    expect(result.totalFees).toBe(5);
  });

  it('calculates sell fees with stamp duty and sh transfer fee', () => {
    const result = estimateTradeFees(
      { side: 'sell', market: 'SH', price: 100, quantity: 1000 },
      profile,
    );
    expect(result.grossAmount).toBe(100_000);
    expect(result.commission).toBe(25);
    expect(result.stampDuty).toBe(50);
    expect(result.transferFee).toBe(1);
    expect(result.totalFees).toBe(76);
  });

  it('calculates transfer fee as 0.001% without minimum', () => {
    const result = estimateTradeFees(
      { side: 'buy', market: 'SH', price: 10, quantity: 100 },
      profile,
    );
    expect(result.transferFee).toBe(0.01);
  });

  it('supports fractional wan commission without minimum', () => {
    const result = estimateTradeFees(
      { side: 'buy', market: 'SZ', price: 4256, quantity: 1, instrumentKind: 'stock' },
      {
        ...profile,
        commissionWan: 1.054,
        commissionMinCents: 0,
      },
    );
    expect(result.commission).toBe(0.45);
    expect(result.totalFees).toBe(0.45);
  });

  it('supports ultra-low commission without minimum', () => {
    const result = estimateTradeFees(
      { side: 'buy', market: 'SZ', price: 10, quantity: 100 },
      {
        ...profile,
        commissionWan: 0.8,
        commissionMinCents: 0,
      },
    );
    expect(result.commission).toBe(0.08);
    expect(result.totalFees).toBe(0.08);
  });

  it('adds sell regulatory surcharge for no-minimum commission accounts', () => {
    const lowProfile = {
      ...profile,
      commissionWan: 1.054,
      commissionMinCents: 0,
    };

    const buyResult = estimateTradeFees(
      { side: 'buy', market: 'SZ', price: 9.01, quantity: 500, instrumentKind: 'stock' },
      lowProfile,
    );
    expect(buyResult.commission).toBe(0.47);
    expect(buyResult.otherFee).toBe(0);
    expect(buyResult.totalFees).toBe(0.47);

    const sellResult = estimateTradeFees(
      { side: 'sell', market: 'SZ', price: 7.32, quantity: 500, instrumentKind: 'stock' },
      lowProfile,
    );
    expect(sellResult.commission).toBe(0.39);
    expect(sellResult.stampDuty).toBe(1.83);
    expect(sellResult.otherFee).toBe(0.1);
    expect(sellResult.totalFees).toBe(2.32);
  });

  it('uses market-specific etf commission for shanghai and shenzhen', () => {
    const marketProfile = {
      ...profile,
      commissionWan: 2.5,
      etfCommissionWan: null,
      etfCommissionMinCents: null,
      etfShCommissionWan: 0.5,
      etfShCommissionMinCents: 0,
      etfSzCommissionWan: 0.8,
      etfSzCommissionMinCents: 500,
    };

    const shResult = estimateTradeFees(
      { side: 'buy', market: 'SH', price: 100, quantity: 1000, instrumentKind: 'etf' },
      marketProfile,
    );
    const szResult = estimateTradeFees(
      { side: 'buy', market: 'SZ', price: 100, quantity: 1000, instrumentKind: 'etf' },
      marketProfile,
    );

    expect(shResult.commission).toBe(5);
    expect(szResult.commission).toBe(8);
  });

  it('uses HK-specific commission rates', () => {
    const result = estimateTradeFees(
      { side: 'buy', market: 'HK', price: 100, quantity: 100, instrumentKind: 'stock' },
      {
        ...profile,
        commissionWan: 2.5,
        hkCommissionWan: 0.3,
        hkCommissionMinCents: 300,
      },
    );
    expect(result.commission).toBe(3);
  });

  it('uses US per-share commission when configured', () => {
    const result = estimateTradeFees(
      { side: 'buy', market: 'US', price: 150, quantity: 200, instrumentKind: 'stock' },
      {
        ...profile,
        commissionWan: 2.5,
        usCommissionPerShare: 0.005,
        usCommissionMinCents: 0,
      },
    );
    expect(result.commission).toBe(1);
  });

  it('applies US per-share minimum commission', () => {
    const result = estimateTradeFees(
      { side: 'buy', market: 'US', price: 10, quantity: 10, instrumentKind: 'stock' },
      {
        ...profile,
        usCommissionPerShare: 0.005,
        usCommissionMinCents: 100,
      },
    );
    expect(result.commission).toBe(1);
  });
});
