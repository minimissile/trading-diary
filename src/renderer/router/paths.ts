export const routePaths = {
  home: '/',
  plans: '/plans',
  watchlist: '/watchlist',
  positions: '/positions',
  positionHistory: '/positions/history',
  positionPnlCalendar: '/positions/pnl-calendar',
  positionChart: '/positions/chart/:symbol',
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
  about: '/about',
  devLlm: '/dev/llm',
} as const;

/**
 * 构建持仓标的 K 线页路径。
 * @param symbol 证券代码
 */
export function buildPositionChartPath(symbol: string): string {
  return `/positions/chart/${encodeURIComponent(symbol.trim().toUpperCase())}`;
}

/**
 * 从路由参数解析证券代码。
 * @param param 路由 :symbol 参数
 */
export function parsePositionChartSymbol(param: string | undefined): string {
  if (!param) return '';
  try {
    return decodeURIComponent(param).trim().toUpperCase();
  } catch {
    return param.trim().toUpperCase();
  }
}
