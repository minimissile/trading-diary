import { describe, expect, it } from 'vitest';
import { listKlines } from '../src/service/market/eastmoney/kline-service';

describe('kline fetch', () => {
  it('returns valid bars for 002387', async () => {
    const result = await listKlines('002387', '1d', 'forward', 5);
    expect(result.bars.length).toBeGreaterThan(0);
    const bar = result.bars[0];
    expect(bar.open).toBeGreaterThan(0);
    expect(bar.close).toBeGreaterThan(0);
    expect(bar.high).toBeGreaterThan(0);
    expect(bar.low).toBeGreaterThan(0);
    expect(Number.isFinite(bar.timestamp)).toBe(true);
  }, 30_000);
});
