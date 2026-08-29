import { describe, expect, it } from 'vitest';
import { resolveCommissionWan } from '../src/shared/accounts/fee-rates';

const baseProfile = {
  commissionWan: 2.5,
  commissionMinCents: 500,
  etfCommissionWan: 1,
  etfCommissionMinCents: 0,
  etfShCommissionWan: 0.5,
  etfShCommissionMinCents: 0,
  etfSzCommissionWan: 0.8,
  etfSzCommissionMinCents: 500,
  stampDutyRatePpm: 500,
  transferFeeRatePpm: 10,
  transferFeeMinCents: 0,
  otherFeeCents: 0,
};

describe('resolveCommissionWan', () => {
  it('uses shanghai etf rates on SH market', () => {
    const rates = resolveCommissionWan(baseProfile, 'etf', 'SH');
    expect(rates.commissionWan).toBe(0.5);
  });

  it('uses shenzhen etf rates on SZ market', () => {
    const rates = resolveCommissionWan(baseProfile, 'lof', 'SZ');
    expect(rates.commissionWan).toBe(0.8);
    expect(rates.minCents).toBe(500);
  });

  it('falls back to unified etf rates when market-specific is absent', () => {
    const rates = resolveCommissionWan(
      {
        ...baseProfile,
        etfShCommissionWan: null,
        etfShCommissionMinCents: null,
        etfSzCommissionWan: null,
        etfSzCommissionMinCents: null,
      },
      'etf',
      'SH',
    );
    expect(rates.commissionWan).toBe(1);
  });
});
