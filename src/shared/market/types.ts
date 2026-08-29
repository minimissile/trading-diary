/** 标的类型：A 股、场内 ETF/LOF、场外开放式基金。 */
export type InstrumentKind = 'stock' | 'etf' | 'lof' | 'otc_fund';

export type DividendEventStatus = 'implemented' | 'announced' | 'proposed' | 'unknown';

export interface InstrumentInfo {
  symbol: string;
  name: string;
  kind: InstrumentKind;
  market: 'SH' | 'SZ' | null;
  secid: string | null;
  f10Code: string | null;
  securityTypeName: string | null;
  source: 'eastmoney';
}

export interface MarketQuote {
  symbol: string;
  name: string;
  kind: InstrumentKind;
  price: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  prevClose: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  amount: number | null;
  peTtm: number | null;
  pb: number | null;
  dividendYieldTtm: number | null;
  nav: number | null;
  navDate: string | null;
  estimatedNav: number | null;
  estimatedNavChangePercent: number | null;
  source: 'eastmoney';
  fetchedAt: string;
}

export interface MarketSnapshot {
  instrument: InstrumentInfo;
  quote: MarketQuote;
}

export interface DividendEvent {
  symbol: string;
  planText: string;
  cashPerShare: number | null;
  status: DividendEventStatus;
  progress: string;
  reportDate: string | null;
  noticeDate: string | null;
  recordDate: string | null;
  exDividendDate: string | null;
  payDate: string | null;
  daysToExDividend: number | null;
  source: 'eastmoney';
}

export interface DividendListResult {
  symbol: string;
  kind: InstrumentKind;
  total: number;
  items: DividendEvent[];
}

export interface MarketNewsItem {
  title: string;
  summary: string | null;
  url: string | null;
  publishedAt: string | null;
  source: 'eastmoney-f10';
}

export interface MarketSearchHit {
  symbol: string;
  name: string;
  securityTypeName: string | null;
  kind: InstrumentKind | 'unknown';
  source: 'eastmoney';
}

/** K 线周期，与看盘软件常用粒度对齐。 */
export type KLinePeriod = '1m' | '5m' | '15m' | '30m' | '60m' | '1d' | '1w' | '1M';

/** K 线复权方式。 */
export type KLineAdjust = 'none' | 'forward' | 'backward';

/** 单根 K 线，字段与 klinecharts 数据模型兼容。 */
export interface KLineBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
  [key: string]: unknown;
}

/** K 线查询结果。 */
export interface KLineListResult {
  symbol: string;
  name: string;
  period: KLinePeriod;
  adjust: KLineAdjust;
  bars: KLineBar[];
}
