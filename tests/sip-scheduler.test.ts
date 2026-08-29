import { describe, expect, it } from 'vitest';
import {
  compareIsoDate,
  computeQuantityFromAmount,
  generateOccurrenceDates,
  previewSchedule,
  resolveDueTransitions,
  shiftIsoDate,
} from '../src/service/sip/sip-scheduler';

describe('sip scheduler', () => {
  it('generates weekly dates on the chosen weekday', () => {
    const dates = generateOccurrenceDates({
      frequency: 'weekly',
      startDate: '2026-01-05',
      dayOfWeek: 1,
      count: 3,
    });
    expect(dates).toEqual(['2026-01-05', '2026-01-12', '2026-01-19']);
  });

  it('generates monthly dates on dayOfMonth', () => {
    const dates = generateOccurrenceDates({
      frequency: 'monthly',
      startDate: '2026-01-10',
      dayOfMonth: 15,
      count: 3,
    });
    expect(dates).toEqual(['2026-01-15', '2026-02-15', '2026-03-15']);
  });

  it('computes quantity from amount and nav', () => {
    expect(computeQuantityFromAmount(1000, 2.5, 0)).toBe(400);
    expect(computeQuantityFromAmount(1000, 2.5, 10)).toBe(396);
  });

  it('marks scheduled occurrences as due and overdue as missed', () => {
    const transitions = resolveDueTransitions(
      [
        { id: 'a', scheduledDate: '2026-01-01', status: 'scheduled' },
        { id: 'b', scheduledDate: '2026-01-05', status: 'due' },
      ],
      '2026-01-10',
      3,
    );
    expect(transitions.toDue).toEqual(['a']);
    expect(transitions.toMissed).toEqual(['b']);
  });

  it('previews create-plan schedule', () => {
    const preview = previewSchedule({
      symbol: '161725',
      amount: 500,
      frequency: 'monthly',
      dayOfMonth: 1,
      startDate: '2026-03-01',
      thesis: '测试',
    });
    expect(preview[0]).toBe('2026-03-01');
    expect(compareIsoDate(preview[1] ?? '', preview[0] ?? '')).toBe(1);
  });

  it('shifts iso dates', () => {
    expect(shiftIsoDate('2026-01-01', 3)).toBe('2026-01-04');
  });
});
