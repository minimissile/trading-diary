import { useCallback, useEffect, useRef, useState } from 'react';
import type { MarketSearchHit } from '../../shared/api.types';
import { queryClient } from '../lib/query-client';
import { queryKeys } from '../lib/queries/keys';

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_THROTTLE_MS = 400;

export interface UseSymbolSearchResult {
  options: MarketSearchHit[];
  loading: boolean;
  error: string | null;
  search: (query: string) => void;
  clear: () => void;
}

/** Debounce input and discard pending/stale results on clear, scope change or unmount. */
export function useSymbolSearch(limit = 8, marketScopes: readonly string[] = ['CN_A'], assetKind?: 'stock' | 'fund'): UseSymbolSearchResult {
  const [options, setOptions] = useState<MarketSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRun = useRef(0);
  const scopesKey = marketScopes.join(',');

  const cancel = useCallback(() => {
    requestSeq.current += 1;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => cancel, [cancel, scopesKey, limit, assetKind]);

  const clear = useCallback(() => {
    cancel();
    setOptions([]);
    setLoading(false);
    setError(null);
  }, [cancel]);

  const search = useCallback(
    (query: string) => {
      cancel();
      const trimmed = query.trim();
      if (!trimmed) {
        clear();
        return;
      }
      const seq = requestSeq.current;
      setOptions([]);
      setError(null);
      setLoading(true);
      const delay = Math.max(SEARCH_DEBOUNCE_MS, SEARCH_THROTTLE_MS - (Date.now() - lastRun.current));
      timer.current = setTimeout(() => {
        timer.current = null;
        lastRun.current = Date.now();
        void queryClient
          .fetchQuery({
            queryKey: [...queryKeys.market.search(trimmed, limit, scopesKey), assetKind ?? 'all'],
            queryFn: () => window.desktop.market.search(trimmed, limit, scopesKey.split(',').filter(Boolean), assetKind),
            staleTime: 60_000,
          })
          .then((hits) => {
            if (seq === requestSeq.current) setOptions(hits);
          })
          .catch(() => {
            if (seq === requestSeq.current) {
              setOptions([]);
              setError('搜索暂不可用，请稍后重新输入');
            }
          })
          .finally(() => {
            if (seq === requestSeq.current) setLoading(false);
          });
      }, delay);
    },
    [cancel, clear, limit, scopesKey, assetKind],
  );

  return { options, loading, error, search, clear };
}
