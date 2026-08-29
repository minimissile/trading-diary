import { describe, expect, it } from 'vitest';
import { computeMilestoneStates, countLitMilestones } from '../src/shared/portfolio/dividend-milestones';
import { computeYtdReceived, computeDailyAverage } from '../src/service/portfolio/dividend-stats';
import type { PortfolioDividendRecord } from '../src/shared/portfolio/types';

function record(partial: Partial<PortfolioDividendRecord> & Pick<PortfolioDividendRecord, 'cashAmount' | 'exDividendDate' | 'status'>): PortfolioDividendRecord {
  return {
    id: '1',
    accountId: 'default',
    symbol: '600941',
    name: '中国移动',
    kind: 'stock',
    recordDate: null,
    payDate: null,
    cashPerShare: 1,
    eligibleQuantity: 100,
    source: 'api',
    ...partial,
  };
}

describe('dividend stats', () => {
  it('sums only confirmed dividends in the requested year', () => {
    const records = [
      record({ exDividendDate: '2026-06-05', cashAmount: 400, status: 'confirmed' }),
      record({ exDividendDate: '2026-03-01', cashAmount: 100, status: 'estimated' }),
      record({ exDividendDate: '2025-06-05', cashAmount: 999, status: 'confirmed' }),
    ];
    expect(computeYtdReceived(records, 2026)).toBe(400);
  });

  it('computes daily average using elapsed calendar days', () => {
    const ytd = 610;
    const avg = computeDailyAverage(ytd, 2026, new Date('2026-08-26T12:00:00'));
    expect(avg).toBeCloseTo(610 / 238, 4);
  });
});

describe('dividend milestones', () => {
  it('lights milestones when thresholds are reached', () => {
    const states = computeMilestoneStates(120);
    expect(states.find((item) => item.id === 'rice')?.lit).toBe(true);
    expect(states.find((item) => item.id === 'quilt')?.lit).toBe(false);
    expect(countLitMilestones(120)).toBe(6);
  });

  it('extends the wall to one million with three new tiers', () => {
    expect(computeMilestoneStates(1_000_000).at(-1)).toMatchObject({
      id: 'million',
      threshold: 1_000_000,
      lit: true,
    });
    expect(countLitMilestones(1_000_000)).toBe(18);
  });
});
