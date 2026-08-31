import { describe, expect, it } from 'vitest';
import { listKlines } from '../src/service/market/eastmoney/kline-service';
import { formatEastMoneyKLineEnd, sliceKLineBars } from '../src/service/market/kline-utils';

describe('kline pagination helpers', () => {
  it('slices latest bars for init requests', () => {
    const bars = Array.from({ length: 300 }, (_, index) => ({
      timestamp: index + 1,
      open: 1,
      high: 1,
      low: 1,
      close: 1,
      volume: 0,
      turnover: 0,
    }));

    const result = sliceKLineBars(bars, 240);
    expect(result.bars).toHaveLength(240);
    expect(result.bars[0]?.timestamp).toBe(61);
    expect(result.hasMoreHistory).toBe(true);
  });

  it('slices older bars for forward requests', () => {
    const bars = Array.from({ length: 10 }, (_, index) => ({
      timestamp: (index + 1) * 86_400_000,
      open: 1,
      high: 1,
      low: 1,
      close: 1,
      volume: 0,
      turnover: 0,
    }));

    const result = sliceKLineBars(bars, 3, 8 * 86_400_000);
    expect(result.bars.map((bar) => bar.timestamp)).toEqual([5, 6, 7].map((day) => day * 86_400_000));
    expect(result.hasMoreHistory).toBe(true);
  });

  it('formats eastmoney end param for daily forward loads', () => {
    const end = formatEastMoneyKLineEnd(new Date('2024-03-15T12:00:00').getTime(), '1d');
    expect(end).toBe('20240314');
  });
});

describe('kline fetch', () => {
  it('returns valid bars for 002387', async () => {
    const result = await listKlines('002387', '1d', 'forward', 5);
    expect(result.bars.length).toBeGreaterThan(0);
    expect(result.hasMoreHistory).toBe(true);
    const bar = result.bars[0]!;
    expect(bar.open).toBeGreaterThan(0);
    expect(bar.close).toBeGreaterThan(0);
    expect(bar.high).toBeGreaterThan(0);
    expect(bar.low).toBeGreaterThan(0);
    expect(Number.isFinite(bar.timestamp)).toBe(true);
  }, 30_000);

  it('loads older daily bars when beforeTimestamp is provided', async () => {
    const recent = await listKlines('002387', '1d', 'forward', 5);
    expect(recent.bars.length).toBeGreaterThan(0);

    const oldest = recent.bars[0]!;
    const older = await listKlines('002387', '1d', 'forward', 5, oldest.timestamp);
    expect(older.bars.every((bar) => bar.timestamp < oldest.timestamp)).toBe(true);
    expect(older.bars.length).toBeGreaterThan(0);
  }, 30_000);
});
