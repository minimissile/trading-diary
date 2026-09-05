/** React Query 缓存键（按领域分组）。 */
export const queryKeys = {
  workspace: {
    all: ['workspace'] as const,
    snapshot: () => [...queryKeys.workspace.all, 'snapshot'] as const,
  },
  accounts: {
    all: ['accounts'] as const,
    list: (includeArchived: boolean) => [...queryKeys.accounts.all, 'list', includeArchived] as const,
    feeProfiles: () => [...queryKeys.accounts.all, 'feeProfiles'] as const,
    page: (includeArchived: boolean) => [...queryKeys.accounts.all, 'page', includeArchived] as const,
  },
  portfolio: {
    all: ['portfolio'] as const,
    dashboard: (accountId: string, year: number) =>
      [...queryKeys.portfolio.all, 'dashboard', accountId, year] as const,
    pnlCalendar: (accountId: string, month: string) =>
      [...queryKeys.portfolio.all, 'pnlCalendar', accountId, month] as const,
    dividends: (accountId: string, year: number, calendarMonth: string) =>
      [...queryKeys.portfolio.all, 'dividends', accountId, year, calendarMonth] as const,
    dividendGoal: (accountId: string) => [...queryKeys.portfolio.all, 'dividendGoal', accountId] as const,
    realizedHistory: (accountId: string, year: number) =>
      [...queryKeys.portfolio.all, 'realizedHistory', accountId, year] as const,
    ledgerEntries: (accountId: string | undefined, symbol: string) =>
      [...queryKeys.portfolio.all, 'ledger', accountId ?? '', symbol] as const,
  },
  sip: {
    all: ['sip'] as const,
    dashboard: (month: string) => [...queryKeys.sip.all, 'dashboard', month] as const,
    plan: (planId: string) => [...queryKeys.sip.all, 'plan', planId] as const,
    occurrenceCalendar: (month: string) => [...queryKeys.sip.all, 'occurrenceCalendar', month] as const,
  },
  alerts: {
    all: ['alerts'] as const,
    dashboard: () => [...queryKeys.alerts.all, 'dashboard'] as const,
  },
  watchlist: {
    all: ['watchlist'] as const,
    personal: () => [...queryKeys.watchlist.all, 'personal'] as const,
    logs: (id: string) => [...queryKeys.watchlist.all, 'logs', id] as const,
    quotes: (symbols: string[]) => [...queryKeys.watchlist.all, 'quotes', ...symbols] as const,
    pools: () => [...queryKeys.watchlist.all, 'pools'] as const,
    poolSnapshot: (poolId: string) => [...queryKeys.watchlist.all, 'pool', poolId] as const,
  },
  plans: {
    all: ['plans'] as const,
    list: () => [...queryKeys.plans.all, 'list'] as const,
  },
  playbook: {
    all: ['playbook'] as const,
    list: () => [...queryKeys.playbook.all, 'list'] as const,
  },
  reviews: {
    all: ['reviews'] as const,
    list: () => [...queryKeys.reviews.all, 'list'] as const,
  },
  episodes: {
    all: ['episodes'] as const,
    list: (accountId: string | undefined) => [...queryKeys.episodes.all, 'list', accountId ?? ''] as const,
  },
  lofArbitrage: {
    all: ['lofArbitrage'] as const,
    meta: () => [...queryKeys.lofArbitrage.all, 'meta'] as const,
    watchMonitor: () => [...queryKeys.lofArbitrage.all, 'watchMonitor'] as const,
    marketScan: (limit: number) => [...queryKeys.lofArbitrage.all, 'marketScan', limit] as const,
  },
  market: {
    all: ['market'] as const,
    snapshot: (symbol: string) => [...queryKeys.market.all, 'snapshot', symbol] as const,
    search: (query: string, limit: number, scopesKey: string) =>
      [...queryKeys.market.all, 'search', query, limit, scopesKey] as const,
  },
  home: {
    all: ['home'] as const,
    overlapPool: () => [...queryKeys.home.all, 'overlapPool'] as const,
    lofPreview: () => [...queryKeys.home.all, 'lofPreview'] as const,
  },
} as const;
