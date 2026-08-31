import { describe, expect, it } from 'vitest';
import {
  isExecutableArbitrage,
  snapshotMatchesExecutableRule,
} from '../src/shared/lof-arbitrage/executable';
import type { LofArbitrageRule, LofArbitrageSnapshot } from '../src/shared/lof-arbitrage/types';

function baseSnapshot(overrides: Partial<LofArbitrageSnapshot> = {}): LofArbitrageSnapshot {
  return {
    symbol: '161226',
    name: '测试 LOF',
    market: 'SZ',
    marketPrice: 2,
    publishedNav: 1.9,
    navDate: '2026-08-28',
    estimatedNav: null,
    estimatedNavChangePercent: null,
    referenceNav: 1.9,
    referenceNavSource: 'published',
    premiumRate: 0.05,
    amount: 500_000,
    volume: 1000,
    subscriptionStatus: 'open',
    subscriptionStatusLabel: '开放申购',
    redemptionStatus: 'open',
    redemptionStatusLabel: '开放赎回',
    feasiblePaths: [],
    recommendedPath: {
      kind: 'premium_exchange_subscribe',
      label: '场内申购 → 卖出',
      milestones: [],
      estimatedNetSpread: 0.03,
      blockers: [],
      feasible: true,
    },
    netSpread: 0.03,
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}

function baseRule(overrides: Partial<LofArbitrageRule> = {}): LofArbitrageRule {
  return {
    id: 'rule-1',
    symbol: null,
    direction: 'both',
    thresholdRate: 0.02,
    minAmount: 100_000,
    requireSubscriptionOpen: true,
    minNetSpread: null,
    status: 'active',
    lastTriggeredAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('isExecutableArbitrage', () => {
  it('returns true only when recommended path is feasible', () => {
    expect(isExecutableArbitrage(baseSnapshot())).toBe(true);
    expect(
      isExecutableArbitrage(
        baseSnapshot({
          recommendedPath: {
            kind: 'premium_exchange_subscribe',
            label: '场内申购 → 卖出',
            milestones: [],
            estimatedNetSpread: null,
            blockers: ['暂停申购，溢价套利不可执行'],
            feasible: false,
          },
        }),
      ),
    ).toBe(false);
  });
});

describe('snapshotMatchesExecutableRule', () => {
  it('matches market-wide premium rule for executable snapshot', () => {
    expect(snapshotMatchesExecutableRule(baseSnapshot(), baseRule())).toBe(true);
  });

  it('rejects high premium when subscription paused', () => {
    expect(
      snapshotMatchesExecutableRule(
        baseSnapshot({
          subscriptionStatus: 'paused',
          recommendedPath: null,
          netSpread: null,
        }),
        baseRule(),
      ),
    ).toBe(false);
  });

  it('rejects when net spread below rule minimum', () => {
    expect(
      snapshotMatchesExecutableRule(
        baseSnapshot({ netSpread: 0.005 }),
        baseRule({ minNetSpread: 0.01 }),
      ),
    ).toBe(false);
  });
});
