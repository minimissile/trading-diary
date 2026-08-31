import { useQuery } from '@tanstack/react-query';
import type { MarketSnapshotView } from '../../../shared/api.types';
import { PORTFOLIO_QUOTE_STALE_MS } from '../query-client';
import { queryKeys } from './keys';

export function useMarketSnapshotQuery(symbol: string | null): {
  snapshot: MarketSnapshotView | undefined;
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: queryKeys.market.snapshot(symbol ?? ''),
    queryFn: () => window.desktop.market.getSnapshot(symbol!),
    enabled: Boolean(symbol),
    staleTime: PORTFOLIO_QUOTE_STALE_MS,
  });
  return { snapshot: query.data, isLoading: query.isLoading };
}

export function useMarketSearchQuery(
  queryText: string,
  limit: number,
  marketScopes: readonly string[],
  enabled: boolean,
): {
  hits: Awaited<ReturnType<typeof window.desktop.market.search>>;
  isLoading: boolean;
} {
  const scopesKey = marketScopes.join(',');
  const query = useQuery({
    queryKey: queryKeys.market.search(queryText, limit, scopesKey),
    queryFn: () => window.desktop.market.search(queryText, limit, [...marketScopes]),
    enabled: enabled && queryText.trim().length >= 1,
    staleTime: 60_000,
  });
  return { hits: query.data ?? [], isLoading: query.isFetching };
}
