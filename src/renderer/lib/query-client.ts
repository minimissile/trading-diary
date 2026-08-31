import { keepPreviousData, QueryClient } from '@tanstack/react-query';

/** 与持仓页行情轮询间隔一致：此时间内视为新鲜，不重复拉取。 */
export const PORTFOLIO_QUOTE_STALE_MS = 30_000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      placeholderData: keepPreviousData,
      staleTime: PORTFOLIO_QUOTE_STALE_MS,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});
