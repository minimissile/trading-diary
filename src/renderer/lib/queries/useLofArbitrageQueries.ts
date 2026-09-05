import { useQuery } from '@tanstack/react-query';
import type {
  LofArbitrageAlertEvent,
  LofArbitrageRule,
  LofArbitrageSnapshot,
  LofWatchItem,
} from '../../../shared/lof-arbitrage/types';
import { isExecutableArbitrage } from '../../../shared/lof-arbitrage/executable';
import type { OverlapPoolItemLive } from '../../../shared/api.types';
import { PORTFOLIO_QUOTE_STALE_MS } from '../query-client';
import { queryKeys } from './keys';

export interface LofArbitrageMetaData {
  watchItems: LofWatchItem[];
  rules: LofArbitrageRule[];
  events: LofArbitrageAlertEvent[];
}

export function useLofArbitrageMetaQuery(): {
  data: LofArbitrageMetaData | undefined;
  isLoading: boolean;
  refetch: () => Promise<void>;
} {
  const query = useQuery({
    queryKey: queryKeys.lofArbitrage.meta(),
    queryFn: async () => {
      const [watchItems, rules, events] = await Promise.all([
        window.desktop.lofArbitrage.listWatchItems(),
        window.desktop.lofArbitrage.listRules(),
        window.desktop.lofArbitrage.listEvents(30),
      ]);
      return { watchItems, rules, events };
    },
  });
  return {
    data: query.data,
    isLoading: query.isLoading,
    refetch: async () => {
      await query.refetch();
    },
  };
}

export function useLofWatchMonitorQuery(enabled = true): {
  watchItems: LofWatchItem[];
  snapshots: LofArbitrageSnapshot[];
  rules: LofArbitrageRule[];
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => Promise<void>;
} {
  const query = useQuery({
    queryKey: queryKeys.lofArbitrage.watchMonitor(),
    queryFn: () => window.desktop.lofArbitrage.refreshMonitor(),
    enabled,
    staleTime: PORTFOLIO_QUOTE_STALE_MS,
  });
  return {
    watchItems: query.data?.watchItems ?? [],
    snapshots: query.data?.snapshots ?? [],
    rules: query.data?.rules ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refetch: async () => {
      await query.refetch();
    },
  };
}

export function useLofMarketScanQuery(
  limit: number,
  enabled = false,
): {
  snapshots: LofArbitrageSnapshot[];
  isLoading: boolean;
  refetch: () => Promise<LofArbitrageSnapshot[] | undefined>;
} {
  const query = useQuery({
    queryKey: queryKeys.lofArbitrage.marketScan(limit),
    queryFn: async () => {
      const result = await window.desktop.lofArbitrage.scanMarket(limit);
      return result.snapshots;
    },
    enabled,
    staleTime: 5 * 60_000,
  });
  return {
    snapshots: query.data ?? [],
    isLoading: query.isLoading,
    refetch: async () => (await query.refetch()).data,
  };
}

export function useHomeOverlapPoolQuery(): {
  items: OverlapPoolItemLive[];
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: queryKeys.home.overlapPool(),
    queryFn: async () => {
      const snapshot = await window.desktop.watchlist.getPoolSnapshot('overlap');
      return snapshot.poolId === 'overlap' ? snapshot.items : [];
    },
    staleTime: PORTFOLIO_QUOTE_STALE_MS,
  });
  return { items: query.data ?? [], isLoading: query.isLoading };
}

export function useHomeLofPreviewQuery(): {
  items: LofArbitrageSnapshot[];
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: queryKeys.home.lofPreview(),
    queryFn: async () => {
      const result = await window.desktop.lofArbitrage.scanMarket(120);
      return result.snapshots.filter((row) => isExecutableArbitrage(row)).slice(0, 3);
    },
    staleTime: 5 * 60_000,
  });
  return { items: query.data ?? [], isLoading: query.isLoading };
}
