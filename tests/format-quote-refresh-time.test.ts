import { describe, expect, it } from 'vitest';
import { formatQuoteRefreshTime } from '../src/shared/format/date-format';

describe('formatQuoteRefreshTime', () => {
  it('formats ISO timestamp in local YYYY-MM-DD HH:mm', () => {
    const formatted = formatQuoteRefreshTime('2026-08-29T14:36:56.819Z');
    expect(formatted).toMatch(/^更新时间 2026-08-29 \d{2}:\d{2}$/);
  });

  it('returns fallback for empty input', () => {
    expect(formatQuoteRefreshTime(null)).toBe('点击刷新行情获取现价');
  });
});
