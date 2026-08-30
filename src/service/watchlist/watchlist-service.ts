import type { MarketQuote } from '../../shared/market/types';
import type { WatchlistPoolId, WatchlistPoolMeta, WatchlistPoolSnapshot } from '../../shared/watchlist/types';
import {
  DIVIDEND_POOL_SEED,
  GROWTH_POOL_SEED,
  OVERLAP_POOL_SEED,
  findDividendSeed,
  findGrowthSeed,
  getWatchlistHighlights,
  listWatchlistPoolMeta,
} from '../../shared/watchlist/pools';
import { marketService } from '../market/market-service';

function quoteMap(quotes: MarketQuote[]): Map<string, MarketQuote> {
  return new Map(quotes.map((quote) => [quote.symbol, quote]));
}

function liveLotCost(price: number | null | undefined): number | null {
  if (price === null || price === undefined || price <= 0) return null;
  return Math.round(price * 100);
}

export class WatchlistService {
  listPools(): WatchlistPoolMeta[] {
    return listWatchlistPoolMeta();
  }

  async getPoolSnapshot(poolId: WatchlistPoolId): Promise<WatchlistPoolSnapshot> {
    const meta = listWatchlistPoolMeta().find((pool) => pool.id === poolId);
    if (!meta) {
      throw new Error(`未知自选池：${poolId}`);
    }

    const fetchedAt = new Date().toISOString();
    const highlights = getWatchlistHighlights(poolId);

    if (poolId === 'dividend') {
      const symbols = DIVIDEND_POOL_SEED.map((item) => item.symbol);
      const quotes = quoteMap(await marketService.getQuotesBySymbols(symbols));
      return {
        poolId,
        meta,
        fetchedAt,
        highlights,
        items: DIVIDEND_POOL_SEED.map((seed) => {
          const quote = quotes.get(seed.symbol) ?? null;
          const price = quote?.price ?? null;
          return {
            ...seed,
            quote,
            liveYieldPercent: quote?.dividendYieldTtm ?? null,
            liveLotCost: liveLotCost(price),
          };
        }),
      };
    }

    if (poolId === 'growth') {
      const symbols = GROWTH_POOL_SEED.map((item) => item.symbol);
      const quotes = quoteMap(await marketService.getQuotesBySymbols(symbols));
      return {
        poolId,
        meta,
        fetchedAt,
        highlights,
        items: GROWTH_POOL_SEED.map((seed) => {
          const quote = quotes.get(seed.symbol) ?? null;
          return {
            ...seed,
            quote,
            liveYieldPercent: quote?.dividendYieldTtm ?? null,
          };
        }),
      };
    }

    const symbols = OVERLAP_POOL_SEED.map((item) => item.symbol);
    const quotes = quoteMap(await marketService.getQuotesBySymbols(symbols));
    return {
      poolId: 'overlap',
      meta,
      fetchedAt,
      highlights,
      items: OVERLAP_POOL_SEED.map((seed) => {
        const quote = quotes.get(seed.symbol) ?? null;
        const dividend = findDividendSeed(seed.symbol);
        const growth = findGrowthSeed(seed.symbol);
        return {
          ...seed,
          quote,
          liveYieldPercent: quote?.dividendYieldTtm ?? null,
          referenceYieldPercent: dividend?.referenceYieldPercent ?? null,
          revenueCagrPercent: growth?.revenueCagrPercent ?? null,
          profitCagrPercent: growth?.profitCagrPercent ?? null,
        };
      }),
    };
  }
}

export const watchlistService = new WatchlistService();
