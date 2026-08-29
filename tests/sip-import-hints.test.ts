import { describe, expect, it } from 'vitest';
import { buildSipAiImportHints, countUnmatchedReadyRows } from '../src/shared/sip/import-hints';

describe('sip import hints', () => {
  it('builds smart plan guidance without blocking import', () => {
    const hints = buildSipAiImportHints({
      planMode: 'smart',
      planModeLabel: '智能定投',
      readyCount: 3,
      unmatchedPlanCount: 2,
    });

    expect(hints.some((hint) => hint.includes('智能定投'))).toBe(true);
    expect(hints.some((hint) => hint.includes('普通定投'))).toBe(true);
    expect(hints.some((hint) => hint.includes('不会丢失'))).toBe(true);
    expect(hints.some((hint) => hint.includes('持仓流水'))).toBe(true);
  });

  it('counts unmatched ready rows from preview', () => {
    const count = countUnmatchedReadyRows([
      {
        status: 'ready',
        matchedPlanName: null,
        message: '未匹配计划，将仅写入持仓流水',
      },
      {
        status: 'ready',
        matchedPlanName: '沪深300',
        message: null,
      },
    ]);

    expect(count).toBe(1);
  });
});
