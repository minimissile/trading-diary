import { describe, expect, it } from 'vitest';
import {
  computeDividendGoalProgressList,
  normalizeDividendGoalSettings,
} from '../src/shared/portfolio/dividend-goal';

describe('dividend goal', () => {
  it('returns empty list when no valid targets exist', () => {
    expect(computeDividendGoalProgressList(null, { ytdReceived: 100, dailyAverage: 1, year: 2026 })).toEqual([]);
    expect(
      computeDividendGoalProgressList({ ytdTarget: null, dailyTarget: null }, {
        ytdReceived: 100,
        dailyAverage: 1,
        year: 2026,
      }),
    ).toEqual([]);
  });

  it('migrates legacy single goal settings', () => {
    expect(
      normalizeDividendGoalSettings({ enabled: true, kind: 'ytd', targetAmount: 1000 }),
    ).toEqual({ ytdTarget: 1000, dailyTarget: null });
    expect(
      normalizeDividendGoalSettings({ enabled: true, kind: 'daily', targetAmount: 5 }),
    ).toEqual({ ytdTarget: null, dailyTarget: 5 });
  });

  it('computes ytd goal progress', () => {
    const [progress] = computeDividendGoalProgressList(
      { ytdTarget: 1000, dailyTarget: null },
      { ytdReceived: 250, dailyAverage: 2, year: 2026 },
    );
    expect(progress).toMatchObject({
      kind: 'ytd',
      kindLabel: '今年累计分红',
      currentAmount: 250,
      targetAmount: 1000,
      progressPercent: 25,
      remaining: 750,
      reached: false,
      year: 2026,
    });
  });

  it('computes both goals at the same time', () => {
    const progressList = computeDividendGoalProgressList(
      { ytdTarget: 1000, dailyTarget: 5 },
      { ytdReceived: 900, dailyAverage: 6.2, year: 2026 },
    );
    expect(progressList).toHaveLength(2);
    expect(progressList[0]?.kind).toBe('ytd');
    expect(progressList[1]?.kind).toBe('daily');
    expect(progressList[1]?.reached).toBe(true);
  });

  it('keeps fractional progress percent', () => {
    const [progress] = computeDividendGoalProgressList(
      { ytdTarget: 1000, dailyTarget: null },
      { ytdReceived: 251, dailyAverage: 2, year: 2026 },
    );
    expect(progress?.progressPercent).toBeCloseTo(25.1, 5);
  });
});
