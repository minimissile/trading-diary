import type { LhbNumericField, LhbRangeKey } from './filters';
export type LhbExchange = 'SH' | 'SZ' | 'BJ' | 'UNKNOWN';
export type LhbPeriod = 'daily' | 'multi' | 'other';
export type LhbSort = 'date' | 'net' | 'buy' | 'sell' | 'change' | 'turnover' | 'appearances' | 'intervalNet' | LhbNumericField;

/** 金额均为人民币分；百分数字段中 10 表示 10%。 */
export interface LhbEvent extends Record<LhbNumericField, number | null> {
  board: string;
  securityType: 'stock' | 'bond' | 'other';
  interpretation: string;
  hasInstitution?: boolean;
  id: string;
  symbol: string;
  name: string;
  exchange: LhbExchange;
  date: string;
  reasonCode: string;
  reason: string;
  period: LhbPeriod;
  close: number | null;
  changePercent: number | null;
  turnoverPercent: number | null;
  buyCents: number | null;
  sellCents: number | null;
  netCents: number | null;
  marketCapCents: number | null;
  netRatioPercent: number | null;
}

export type LhbSecurityType = 'stock' | 'bond' | 'all';
export type LhbInstitution = Pick<
  LhbEvent,
  | 'symbol'
  | 'date'
  | 'reason'
  | 'exchange'
  | 'institutionBuyCount'
  | 'institutionSellCount'
  | 'institutionBuyCents'
  | 'institutionSellCents'
  | 'institutionNetCents'
  | 'institutionNetRatioPercent'
>;
export interface LhbQueryInput extends Partial<Record<LhbRangeKey, number>> {
  securityType?: LhbSecurityType;
  board?: string;
  reasonCode?: string;
  interpretation?: string;
  hasInstitution?: boolean;
  includeInstitution?: boolean;
  view?: 'events' | 'stocks';
  countMode?: 'days' | 'events';
  minAppearances?: number;
  maxAppearances?: number;
  startDate: string;
  endDate: string;
  symbol?: string;
  keyword?: string;
  exchange?: LhbExchange;
  period?: LhbPeriod;
  reason?: string;
  minNetCents?: number;
  maxNetCents?: number;
  minChangePercent?: number;
  maxChangePercent?: number;
  minTurnoverPercent?: number;
  maxTurnoverPercent?: number;
  minMarketCapCents?: number;
  maxMarketCapCents?: number;
  sort?: LhbSort;
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  refresh?: boolean;
}

export interface LhbFreshness {
  source: 'eastmoney';
  fetchedAt: string;
  stale: boolean;
  warning: string | null;
}

export interface LhbStatus extends LhbFreshness {
  latestDate: string;
}

export interface LhbStockSummary {
  key: string;
  latestEvent: LhbEvent;
  appearances: number;
  eventCount: number;
  tradingDays: number;
  firstDate: string;
  lastDate: string;
  /** 所选区间全部单日榜的去重净买额，不受事件筛选或计次口径影响。 */
  intervalNetCents: number | null;
  intervalNetDays: number;
  intervalNetExcludedRecords: number;
  intervalNetUnresolvedDays: number;
}

export interface LhbQueryResult extends LhbFreshness {
  stocks: LhbStockSummary[];
  facets: { boards: string[]; reasons: Array<{ code: string; text: string }> };
  items: LhbEvent[];
  total: number;
  page: number;
  pageSize: number;
  summary: { securities: number; tradingDays: number };
  coverage: { startDate: string; endDate: string; complete: true };
}

export interface LhbSeat {
  id: string;
  eventId: string;
  reasonCode: string;
  reason: string;
  side: 'buy' | 'sell';
  rank: number;
  departmentCode: string;
  departmentName: string;
  buyCents: number | null;
  sellCents: number | null;
  netCents: number | null;
  buyRatioPercent: number | null;
  sellRatioPercent: number | null;
}

export interface LhbDetailInput {
  symbol: string;
  date: string;
  refresh?: boolean;
}

export interface LhbDetail extends LhbFreshness {
  symbol: string;
  date: string;
  events: LhbEvent[];
  seats: LhbSeat[];
}

export interface LonghubangApi {
  getStatus: (refresh?: boolean) => Promise<LhbStatus>;
  query: (input: LhbQueryInput) => Promise<LhbQueryResult>;
  getDetail: (input: LhbDetailInput) => Promise<LhbDetail>;
}

export interface LonghubangMethods {
  'longhubang.status': { params: { refresh?: boolean }; result: LhbStatus };
  'longhubang.query': { params: LhbQueryInput; result: LhbQueryResult };
  'longhubang.detail': { params: LhbDetailInput; result: LhbDetail };
}

export const LHB_EXCHANGE_LABELS: Record<LhbExchange, string> = {
  SH: '沪市',
  SZ: '深市',
  BJ: '北交所',
  UNKNOWN: '其他',
};
export const LHB_PERIOD_LABELS: Record<LhbPeriod, string> = {
  daily: '单日榜',
  multi: '多日榜',
  other: '其他榜',
};
