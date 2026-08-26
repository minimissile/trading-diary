import type { MarketQuote } from '../market/types';

export type WatchlistPoolId = 'dividend' | 'growth' | 'overlap';

export type DividendStabilityGrade = 'A+' | 'A' | 'A-' | 'B+';

export interface WatchlistPoolMeta {
  id: WatchlistPoolId;
  title: string;
  description: string;
  dataDate: string;
  itemCount: number;
}

export interface DividendPoolSeed {
  symbol: string;
  name: string;
  industry: string;
  dividendPerShare2023: number;
  dividendPerShare2024: number;
  dividendPerShare2025: number;
  referenceYieldPercent: number;
  referenceLotCost: number;
  stability: DividendStabilityGrade;
  thesis: string;
}

export interface GrowthPoolSeed {
  symbol: string;
  name: string;
  industry: string;
  revenueCagrPercent: number;
  profitCagrPercent: number;
  roe2025Percent: number;
  drivers: string;
  risks: string;
}

export interface OverlapPoolSeed {
  symbol: string;
  name: string;
  positioning: string;
  notes: string;
}

export interface DividendPoolItemLive extends DividendPoolSeed {
  quote: MarketQuote | null;
  liveYieldPercent: number | null;
  liveLotCost: number | null;
}

export interface GrowthPoolItemLive extends GrowthPoolSeed {
  quote: MarketQuote | null;
  liveYieldPercent: number | null;
}

export interface OverlapPoolItemLive extends OverlapPoolSeed {
  quote: MarketQuote | null;
  liveYieldPercent: number | null;
  referenceYieldPercent: number | null;
  revenueCagrPercent: number | null;
  profitCagrPercent: number | null;
}

export type WatchlistPoolSnapshot =
  | {
      poolId: 'dividend';
      meta: WatchlistPoolMeta;
      fetchedAt: string;
      highlights: readonly string[];
      items: DividendPoolItemLive[];
    }
  | {
      poolId: 'growth';
      meta: WatchlistPoolMeta;
      fetchedAt: string;
      highlights: readonly string[];
      items: GrowthPoolItemLive[];
    }
  | {
      poolId: 'overlap';
      meta: WatchlistPoolMeta;
      fetchedAt: string;
      highlights: readonly string[];
      items: OverlapPoolItemLive[];
    };
