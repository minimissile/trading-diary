import { describe, expect, it } from 'vitest';
import { formatFloatingPnlCaption } from '../src/shared/format/display-presets';

describe('formatFloatingPnlCaption', () => {
  it('uses friendly profit/loss captions', () => {
    expect(formatFloatingPnlCaption(69.2)).toBe('当前盈利中');
    expect(formatFloatingPnlCaption(-12.3)).toBe('当前亏损中');
    expect(formatFloatingPnlCaption(0)).toBe('盈亏持平');
  });

  it('prioritizes missing quote warning', () => {
    expect(formatFloatingPnlCaption(69.2, { missingQuoteCount: 1 })).toBe('1 个标的暂无现价');
  });
});
