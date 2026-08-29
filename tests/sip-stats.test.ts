import { describe, expect, it } from 'vitest';
import {
  buildOccurrenceCalendar,
  computeCurrentStreak,
  computeLongestStreak,
} from '../src/service/sip/sip-stats';

describe('sip stats phase 2', () => {
  it('computes current and longest streaks', () => {
    const occurrences = [
      { status: 'completed' as const, scheduledDate: '2026-01-01' },
      { status: 'completed' as const, scheduledDate: '2026-02-01' },
      { status: 'skipped' as const, scheduledDate: '2026-03-01' },
      { status: 'completed' as const, scheduledDate: '2026-04-01' },
      { status: 'completed' as const, scheduledDate: '2026-05-01' },
    ];
    expect(computeCurrentStreak(occurrences)).toBe(2);
    expect(computeLongestStreak(occurrences)).toBe(2);
  });

  it('builds occurrence calendar by month', () => {
    const days = buildOccurrenceCalendar('2026-03', [
      {
        id: '1',
        planId: 'p1',
        scheduledDate: '2026-03-01',
        status: 'due',
        amount: null,
        planName: '白酒指数',
        symbol: '161725',
        plannedAmount: 500,
      },
      {
        id: '2',
        planId: 'p2',
        scheduledDate: '2026-03-15',
        status: 'completed',
        amount: 500,
        planName: '沪深300',
        symbol: '510300',
        plannedAmount: 300,
      },
    ]);
    expect(days).toHaveLength(2);
    expect(days[0]?.date).toBe('2026-03-01');
    expect(days[0]?.items[0]?.planName).toBe('白酒指数');
  });
});
