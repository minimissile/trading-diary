export const routePaths = {
  home: '/',
  plans: '/plans',
  watchlist: '/watchlist',
  positions: '/positions',
  dividends: '/dividends',
  /** @deprecated 兼容旧链接，路由层重定向至 positions */
  portfolio: '/portfolio',
  accounts: '/accounts',
  sip: '/sip',
  alerts: '/alerts',
  journal: '/journal',
  import: '/import',
  playbook: '/playbook',
  analysis: '/analysis',
  settings: '/settings',
  devLlm: '/dev/llm',
  devChart: '/dev/chart',
} as const;
