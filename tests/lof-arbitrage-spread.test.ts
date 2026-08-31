import { describe, expect, it } from 'vitest';
import { evaluateArbitragePaths, pickRecommendedPath } from '../src/service/lof-arbitrage/feasibility-checker';
import {
  computeDiscountNetSpread,
  computePremiumNetSpread,
  computePremiumRate,
  resolveReferenceNav,
} from '../src/service/lof-arbitrage/spread-calculator';

describe('resolveReferenceNav', () => {
  it('prefers estimated nav during trading session', () => {
    expect(
      resolveReferenceNav({
        publishedNav: 1.9,
        estimatedNav: 1.95,
        tradingSessionActive: true,
      }),
    ).toEqual({ referenceNav: 1.95, referenceNavSource: 'estimated' });
  });

  it('falls back to published nav after close', () => {
    expect(
      resolveReferenceNav({
        publishedNav: 1.9,
        estimatedNav: 1.95,
        tradingSessionActive: false,
      }),
    ).toEqual({ referenceNav: 1.9, referenceNavSource: 'published' });
  });
});

describe('computePremiumRate', () => {
  it('computes positive premium', () => {
    const rate = computePremiumRate(1.993, 1.9029);
    expect(rate).not.toBeNull();
    expect(rate!).toBeCloseTo(0.0474, 3);
  });
});

describe('net spread', () => {
  it('subtracts fees from premium path', () => {
    expect(computePremiumNetSpread(0.05)).toBeCloseTo(0.05 - 0.0012 - 0.0001, 6);
  });

  it('subtracts fees from discount path', () => {
    expect(computeDiscountNetSpread(-0.03)).toBeCloseTo(0.03 - 0.015 - 0.0001, 6);
  });
});

describe('evaluateArbitragePaths', () => {
  it('blocks premium path when subscription paused', () => {
    const paths = evaluateArbitragePaths({
      market: 'SZ',
      premiumRate: 0.05,
      amount: 1_000_000,
      subscriptionStatus: 'paused',
      redemptionStatus: 'open',
    });
    const premium = paths.find((path) => path.kind === 'premium_exchange_subscribe');
    expect(premium?.feasible).toBe(false);
    expect(premium?.blockers).toContain('暂停申购，溢价套利不可执行');
  });

  it('recommends feasible premium path when open', () => {
    const paths = evaluateArbitragePaths({
      market: 'SZ',
      premiumRate: 0.05,
      amount: 1_000_000,
      subscriptionStatus: 'open',
      redemptionStatus: 'open',
    });
    const recommended = pickRecommendedPath(paths);
    expect(recommended?.kind).toBe('premium_exchange_subscribe');
    expect(recommended?.feasible).toBe(true);
  });
});
