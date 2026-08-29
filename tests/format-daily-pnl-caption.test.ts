import { describe, expect, it } from 'vitest';
import { formatDailyPnlCaption } from '../src/shared/format/display-presets';

describe('formatDailyPnlCaption', () => {
  it('reports missing quote count', () => {
    expect(formatDailyPnlCaption(0, { missingQuoteCount: 2 })).toBe('2 个标的暂无日收益');
  });

  it('describes positive daily pnl', () => {
    expect(formatDailyPnlCaption(88.5)).toBe('今日盈利中');
  });

  it('describes negative daily pnl', () => {
    expect(formatDailyPnlCaption(-12)).toBe('今日亏损中');
  });

  it('describes flat daily pnl', () => {
    expect(formatDailyPnlCaption(0)).toBe('今日持平');
  });
});
