import { keepPreviousData, QueryClient } from '@tanstack/react-query';
import { IS_RENDERER_DEV } from './dev-mode';

/** 与持仓页行情轮询间隔一致：此时间内视为新鲜，不重复拉取。 */
export const PORTFOLIO_QUOTE_STALE_MS = 30_000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      placeholderData: keepPreviousData,
      staleTime: IS_RENDERER_DEV ? 5 * 60_000 : PORTFOLIO_QUOTE_STALE_MS,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: !IS_RENDERER_DEV,
      refetchOnReconnect: !IS_RENDERER_DEV,
      retry: IS_RENDERER_DEV ? 0 : 1,
    },
  },
});
