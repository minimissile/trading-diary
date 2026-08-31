import { useQuery, useQueryClient, type QueryObserverResult } from '@tanstack/react-query';
import type { PortfolioPositionView, PortfolioSummaryView } from '../../shared/portfolio/types';
import { PORTFOLIO_QUOTE_STALE_MS, queryClient } from '../lib/query-client';

export interface PortfolioDashboardData {
  summary: PortfolioSummaryView;
  positions: PortfolioPositionView[];
}

export const portfolioQueryKeys = {
  all: ['portfolio'] as const,
  dashboard: (accountId: string, year: number) =>
    [...portfolioQueryKeys.all, 'dashboard', accountId, year] as const,
};

async function fetchPortfolioDashboard(accountId: string, year: number): Promise<PortfolioDashboardData> {
  const [summary, positions] = await Promise.all([
    window.desktop.portfolio.getSummary(accountId, year),
    window.desktop.portfolio.syncMarketQuotes(accountId),
  ]);
  return { summary, positions };
}

export function usePortfolioDashboard(accountId: string, year: number): {
  summary: PortfolioSummaryView | undefined;
  positions: PortfolioPositionView[];
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => Promise<QueryObserverResult<PortfolioDashboardData, Error>>;
  invalidate: () => Promise<void>;
} {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: portfolioQueryKeys.dashboard(accountId, year),
    queryFn: () => fetchPortfolioDashboard(accountId, year),
    staleTime: PORTFOLIO_QUOTE_STALE_MS,
    refetchOnMount: 'always',
    refetchInterval: PORTFOLIO_QUOTE_STALE_MS,
    refetchIntervalInBackground: false,
  });

  return {
    summary: query.data?.summary,
    positions: query.data?.positions ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refetch: query.refetch,
    invalidate: async () => {
      await client.invalidateQueries({ queryKey: portfolioQueryKeys.dashboard(accountId, year) });
    },
  };
}

/** 供 mutation 回调等处直接失效持仓缓存。 */
export async function invalidatePortfolioDashboard(accountId: string, year = new Date().getFullYear()): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: portfolioQueryKeys.dashboard(accountId, year) });
}
