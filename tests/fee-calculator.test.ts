import { describe, expect, it } from 'vitest';
import { FEE_PROFILE_A_SHARE_STANDARD } from '../src/shared/accounts/fee-presets';
import { estimateTradeFees } from '../src/service/accounts/fee-calculator';

describe('estimateTradeFees', () => {
  const profile = {
    commissionRatePpm: FEE_PROFILE_A_SHARE_STANDARD.commissionRatePpm,
    commissionMinCents: FEE_PROFILE_A_SHARE_STANDARD.commissionMinCents,
    etfCommissionRatePpm: null,
    etfCommissionMinCents: null,
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

  it('supports ultra-low commission without minimum', () => {
    const result = estimateTradeFees(
      { side: 'buy', market: 'SZ', price: 10, quantity: 100 },
      {
        ...profile,
        commissionRatePpm: 80,
        commissionMinCents: 0,
      },
    );
    expect(result.commission).toBe(0.08);
    expect(result.totalFees).toBe(0.08);
  });

  it('uses etf commission tier and skips stamp duty on sell', () => {
    const result = estimateTradeFees(
      { side: 'sell', market: 'SH', price: 100, quantity: 1000, instrumentKind: 'etf' },
      {
        ...profile,
        commissionRatePpm: 250,
        etfCommissionRatePpm: 50,
        etfCommissionMinCents: 0,
      },
    );
    expect(result.commission).toBe(5);
    expect(result.stampDuty).toBe(0);
    expect(result.transferFee).toBe(1);
    expect(result.totalFees).toBe(6);
  });
});
