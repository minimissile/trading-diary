import { useQuery } from '@tanstack/react-query';
import type { WatchlistPoolId, WatchlistPoolMeta, WatchlistPoolSnapshot } from '../../../shared/api.types';
import { PORTFOLIO_QUOTE_STALE_MS } from '../query-client';
import { queryKeys } from './keys';

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
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refetch: async () => {
      await query.refetch();
    },
  };
}
