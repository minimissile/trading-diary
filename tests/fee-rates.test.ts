import { describe, expect, it } from 'vitest';
import { resolveCommissionRates, resolveCommissionWan } from '../src/shared/accounts/fee-rates';

const baseProfile = {
  commissionWan: 2.5,
  commissionMinCents: 500,
  etfCommissionWan: 1,
  etfCommissionMinCents: 0,
  etfShCommissionWan: 0.5,
  etfShCommissionMinCents: 0,
  etfSzCommissionWan: 0.8,
  etfSzCommissionMinCents: 500,
  hkCommissionWan: 0.3,
  hkCommissionMinCents: 300,
  usCommissionWan: null,
  usCommissionMinCents: 100,
  usCommissionPerShare: 0.005,
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

  it('uses HK-specific rates on HK market', () => {
    const rates = resolveCommissionWan(baseProfile, 'stock', 'HK');
    expect(rates.commissionWan).toBe(0.3);
    expect(rates.minCents).toBe(300);
  });

  it('uses US per-share rates on US market', () => {
    const rates = resolveCommissionRates(baseProfile, 'stock', 'US');
    expect(rates.perShare).toBe(0.005);
    expect(rates.minCents).toBe(100);
  });
});
