import { useCallback, useMemo, useRef, useState } from 'react';
import type { MarketSearchHit } from '../../shared/api.types';
import { debounce, throttle } from '../../shared/timing';

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_THROTTLE_MS = 400;
const MIN_QUERY_LENGTH = 1;
const DEFAULT_LIMIT = 8;

export interface UseSymbolSearchResult {
  options: MarketSearchHit[];
  loading: boolean;
  /** 根据输入发起搜索（内部已防抖 + 节流）。 */
  search: (query: string) => void;
  /** 清空建议列表与进行中的请求。 */
  clear: () => void;
}

/**
 * 标的搜索建议 Hook：输入防抖 300ms，请求节流 400ms。
 * @param limit 返回建议条数上限
 */
export function useSymbolSearch(limit = DEFAULT_LIMIT): UseSymbolSearchResult {
  const [options, setOptions] = useState<MarketSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const requestSeq = useRef(0);

  const fetchHits = useMemo(
    () =>
      throttle((query: string) => {
        const seq = ++requestSeq.current;
        setLoading(true);
        void window.desktop.market
          .search(query, limit)
          .then((hits) => {
            if (seq !== requestSeq.current) return;
            setOptions(hits);
          })
          .catch(() => {
            if (seq !== requestSeq.current) return;
            setOptions([]);
          })
          .finally(() => {
            if (seq === requestSeq.current) setLoading(false);
          });
      }, SEARCH_THROTTLE_MS),
    [limit],
  );

  const debouncedFetch = useMemo(() => debounce(fetchHits, SEARCH_DEBOUNCE_MS), [fetchHits]);

  const search = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (trimmed.length < MIN_QUERY_LENGTH) {
        requestSeq.current += 1;
        setOptions([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      debouncedFetch(trimmed);
    },
    [debouncedFetch],
  );

  const clear = useCallback(() => {
    requestSeq.current += 1;
    setOptions([]);
    setLoading(false);
  }, []);

  return { options, loading, search, clear };
}
