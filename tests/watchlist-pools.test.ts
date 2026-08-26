import { describe, expect, it } from 'vitest';
import {
  DIVIDEND_POOL_SEED,
  GROWTH_POOL_SEED,
  OVERLAP_POOL_SEED,
  listWatchlistPoolMeta,
} from '../src/shared/watchlist/pools';

describe('watchlist pools seed', () => {
  it('lists three pools with expected counts', () => {
    const pools = listWatchlistPoolMeta();
    expect(pools).toHaveLength(3);
    expect(pools.map((pool) => pool.id)).toEqual(['dividend', 'growth', 'overlap']);
    expect(pools[0]?.itemCount).toBe(20);
    expect(pools[1]?.itemCount).toBe(20);
    expect(pools[2]?.itemCount).toBe(4);
  });

  it('keeps unique symbols within each pool', () => {
    for (const pool of [DIVIDEND_POOL_SEED, GROWTH_POOL_SEED, OVERLAP_POOL_SEED]) {
      const symbols = pool.map((item) => item.symbol);
      expect(new Set(symbols).size).toBe(symbols.length);
    }
  });

  it('marks overlap symbols as members of both dividend and growth pools', () => {
    const overlapSymbols = OVERLAP_POOL_SEED.map((item) => item.symbol);
    for (const symbol of overlapSymbols) {
      expect(DIVIDEND_POOL_SEED.some((item) => item.symbol === symbol)).toBe(true);
      expect(GROWTH_POOL_SEED.some((item) => item.symbol === symbol)).toBe(true);
    }
  });
});
