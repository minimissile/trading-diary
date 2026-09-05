import { useQuery } from '@tanstack/react-query';
import type { WatchlistPoolId, WatchlistPoolMeta, WatchlistPoolSnapshot } from '../../../shared/api.types';
import { PORTFOLIO_QUOTE_STALE_MS } from '../query-client';
import { queryKeys } from './keys';
import type { PersonalWatchlistItem } from '../../../shared/watchlist/personal';
import { marketLookupKey } from '../../../shared/market/instrument-id';

export function usePersonalWatchlistQuery() {
  return useQuery({
    queryKey: queryKeys.watchlist.personal(),
    queryFn: () => window.desktop.watchlist.listPersonal(),
    refetchInterval: PORTFOLIO_QUOTE_STALE_MS,
  });
}

export function useWatchlistQuotesQuery(items: PersonalWatchlistItem[], enabled = true) {
  const symbols = items.map(marketLookupKey).sort();
  return useQuery({
    queryKey: queryKeys.watchlist.quotes(symbols),
    queryFn: async () => {
      const batches = [];
      for (let offset = 0; offset < symbols.length; offset += 20) {
        batches.push(window.desktop.market.getQuotes(symbols.slice(offset, offset + 20)));
      }
      return (await Promise.all(batches)).flat();
    },
    enabled: enabled && symbols.length > 0,
    placeholderData: undefined,
    staleTime: PORTFOLIO_QUOTE_STALE_MS,
    refetchInterval: PORTFOLIO_QUOTE_STALE_MS,
    refetchIntervalInBackground: false,
  });
}

export function useTrackingLogsQuery(itemId: string) {
  return useQuery({
    queryKey: queryKeys.watchlist.logs(itemId),
    queryFn: () => window.desktop.watchlist.listLogs(itemId),
    placeholderData: undefined,
  });
}

export function useWatchlistPoolsQuery(): {
  pools: WatchlistPoolMeta[];
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: queryKeys.watchlist.pools(),
    queryFn: () => window.desktop.watchlist.listPools(),
  });
  return { pools: query.data ?? [], isLoading: query.isLoading };
}

export function useWatchlistPoolSnapshotQuery(poolId: WatchlistPoolId): {
  snapshot: WatchlistPoolSnapshot | null | undefined;
  error: Error | null;
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => Promise<void>;
} {
  const query = useQuery({
    queryKey: queryKeys.watchlist.poolSnapshot(poolId),
    queryFn: () => window.desktop.watchlist.getPoolSnapshot(poolId),
    staleTime: PORTFOLIO_QUOTE_STALE_MS,
  });
  return {
    snapshot: query.data,
    error: query.error,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refetch: async () => {
      await query.refetch();
    },
  };
}
