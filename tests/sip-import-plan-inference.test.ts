import { describe, expect, it } from 'vitest';
import { inferSipPlanInputFromImport } from '../src/service/sip/sip-import-plan-inference';
import type { NormalizedSipImportRow } from '../src/service/sip/sip-row-normalizer';

function row(partial: Partial<NormalizedSipImportRow> & Pick<NormalizedSipImportRow, 'scheduledDate' | 'amount'>): NormalizedSipImportRow {
  return {
    symbol: '110011',
    tradeAt: `${partial.scheduledDate}T09:30:00.000Z`,
    nav: 5,
    quantity: 100,
    fees: 0,
    ...partial,
  };
}

describe('sip import plan inference', () => {
  it('infers monthly plan from two month-apart deductions', () => {
    const input = inferSipPlanInputFromImport([
      row({ scheduledDate: '2026-01-02', amount: 500 }),
      row({ scheduledDate: '2026-02-02', amount: 520 }),
    ]);

    expect(input.frequency).toBe('monthly');
    expect(input.dayOfMonth).toBe(2);
    expect(input.startDate).toBe('2026-01-02');
    expect(input.amount).toBe(510);
    expect(input.activateNow).toBe(true);
  });

  it('uses ai plan hints when symbol matches', () => {
    const input = inferSipPlanInputFromImport([row({ scheduledDate: '2026-01-08', amount: 300 })], {
      symbol: '110011',
      fundName: '易方达优质精选',
      amount: 500,
      startDate: '2026-01-01',
      frequency: 'monthly',
      dayOfMonth: 8,
      dayOfWeek: null,
    });

    expect(input.amount).toBe(500);
    expect(input.dayOfMonth).toBe(8);
    expect(input.startDate).toBe('2026-01-01');
  });
});
