import { useQuery, useQueryClient, type QueryObserverResult } from '@tanstack/react-query';
import type {
  DividendCalendarDay,
  PortfolioDividendRecord,
  PortfolioPnlCalendarView,
  PortfolioRealizedHistoryView,
  PortfolioSummaryView,
} from '../../../shared/portfolio/types';
import type { PortfolioPositionView } from '../../../shared/portfolio/types';
import type { DividendGoalSettings } from '../../../shared/portfolio/dividend-goal';
import type { PortfolioLedgerEntry } from '../../../shared/portfolio/types';
import { PORTFOLIO_QUOTE_STALE_MS } from '../query-client';
import { IS_RENDERER_DEV } from '../dev-mode';
import { queryKeys } from './keys';

export interface PortfolioDashboardData {
  summary: PortfolioSummaryView;
  positions: PortfolioPositionView[];
}

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
    queryKey: queryKeys.portfolio.dashboard(accountId, year),
    queryFn: () => fetchPortfolioDashboard(accountId, year),
    staleTime: PORTFOLIO_QUOTE_STALE_MS,
    refetchOnMount: IS_RENDERER_DEV ? false : 'always',
    refetchInterval: IS_RENDERER_DEV ? false : PORTFOLIO_QUOTE_STALE_MS,
    refetchIntervalInBackground: false,
  });

  return {
    summary: query.data?.summary,
    positions: query.data?.positions ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refetch: query.refetch,
    invalidate: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.portfolio.dashboard(accountId, year) });
    },
  };
}

export function usePnlCalendarQuery(accountId: string, month: string): {
  view: PortfolioPnlCalendarView | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isPlaceholderData: boolean;
  error: Error | null;
  refetch: () => Promise<PortfolioPnlCalendarView | undefined>;
} {
  const query = useQuery({
    queryKey: queryKeys.portfolio.pnlCalendar(accountId, month),
    queryFn: () => window.desktop.portfolio.getPnlCalendar(accountId, month),
  });
  return {
    view: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isPlaceholderData: query.isPlaceholderData,
    error: query.error,
    refetch: async () => (await query.refetch()).data,
  };
}

export interface DividendsDashboardData {
  summary: PortfolioSummaryView;
  dividends: PortfolioDividendRecord[];
  calendarDays: DividendCalendarDay[];
}

export function useDividendsDashboardQuery(
  accountId: string,
  year: number,
  calendarMonth: string,
): {
  data: DividendsDashboardData | undefined;
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => Promise<void>;
} {
  const query = useQuery({
    queryKey: queryKeys.portfolio.dividends(accountId, year, calendarMonth),
    queryFn: async () => {
      const [summary, dividends, calendarDays] = await Promise.all([
        window.desktop.portfolio.getSummary(accountId, year),
        window.desktop.portfolio.listDividends(accountId, year),
        window.desktop.portfolio.getDividendCalendar(accountId, calendarMonth),
      ]);
      return { summary, dividends, calendarDays };
    },
  });
  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refetch: async () => {
      await query.refetch();
    },
  };
}

export function useDividendGoalQuery(accountId: string): {
  goalSettings: DividendGoalSettings | null | undefined;
  isLoading: boolean;
  refetch: () => Promise<void>;
} {
  const query = useQuery({
    queryKey: queryKeys.portfolio.dividendGoal(accountId),
    queryFn: () => window.desktop.portfolio.getDividendGoal(accountId),
  });
  return {
    goalSettings: query.data,
    isLoading: query.isLoading,
    refetch: async () => {
      await query.refetch();
    },
  };
}

export function useRealizedHistoryQuery(accountId: string, year: number): {
  history: PortfolioRealizedHistoryView | undefined;
  isLoading: boolean;
  refetch: () => Promise<void>;
} {
  const query = useQuery({
    queryKey: queryKeys.portfolio.realizedHistory(accountId, year),
    queryFn: () => window.desktop.portfolio.getRealizedHistory(accountId, year),
  });
  return {
    history: query.data,
    isLoading: query.isLoading,
    refetch: async () => {
      await query.refetch();
    },
  };
}

export function useLedgerEntriesQuery(
  accountId: string | undefined,
  symbol: string,
  enabled = true,
): {
  entries: PortfolioLedgerEntry[];
  isLoading: boolean;
  refetch: () => Promise<void>;
} {
  const query = useQuery({
    queryKey: queryKeys.portfolio.ledgerEntries(accountId, symbol),
    queryFn: () => window.desktop.portfolio.listLedgerEntries(accountId, symbol),
    enabled: enabled && Boolean(symbol),
  });
  return {
    entries: query.data ?? [],
    isLoading: query.isLoading,
    refetch: async () => {
      await query.refetch();
    },
  };
}

/** @deprecated 请使用 queryKeys.portfolio.dashboard */
export const portfolioQueryKeys = queryKeys.portfolio;
