import { describe, expect, it } from 'vitest';
import {
  defaultTradeAt,
  parseTradeAt,
  tradeAtToIso,
} from '../src/shared/trade-calendar';

describe('trade date helpers', () => {
  it('normalizes tradeAt to Shanghai start of day', () => {
    expect(tradeAtToIso(parseTradeAt('2026-08-29T15:30:00+08:00'))).toBe('2026-08-29T00:00:00+08:00');
  });

  it('parses stored tradeAt without keeping time component', () => {
    const parsed = parseTradeAt('2026-08-28T15:30:00.000Z');
    expect(parsed.format('HH:mm:ss Z')).toBe('00:00:00 +08:00');
  });

  it('defaults to today at Shanghai start of day', () => {
    const today = defaultTradeAt();
    expect(today.format('YYYY-MM-DD')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
