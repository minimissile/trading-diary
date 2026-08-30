import type { InstrumentKind } from '../market/types';

export type PortfolioLedgerSide = 'buy' | 'sell' | 'dividend_reinvest';
export type PortfolioLedgerSource = 'manual' | 'csv' | 'plan' | 'sip';
export type DividendRecordStatus = 'estimated' | 'confirmed' | 'rejected';
export type DividendRecordSource = 'api' | 'manual';

export interface CreatePortfolioLedgerInput {
  accountId?: string;
  symbol: string;
  kind?: InstrumentKind;
  side: PortfolioLedgerSide;
  quantity: number;
  price: number;
  fees?: number;
  tradeAt: string;
  planId?: string | null;
  note?: string;
  source?: PortfolioLedgerSource;
  sipOccurrenceId?: string | null;
}

export interface UpdatePortfolioLedgerInput {
  side?: PortfolioLedgerSide;
  quantity?: number;
  price?: number;
  fees?: number;
  tradeAt?: string;
  note?: string;
}

export interface PortfolioPositionView {
  symbol: string;
  name: string;
  kind: InstrumentKind;
  quantity: number;
  /** 不含费用的加权成交均价（对齐券商「成本价」展示）。 */
  avgPrice: number;
  /** 含买入费用的摊薄成本。 */
  avgCost: number;
  marketPrice: number | null;
  marketValue: number | null;
  /** 参考浮动盈亏 = 市值 − 成本 − 预估卖出费用（对齐券商展示）。 */
  unrealizedPnl: number | null;
  /** 参考收益率 = 参考浮盈 / 含费总成本（对齐同花顺）。 */
  unrealizedReturnPercent: number | null;
  /** 当日盈亏（持仓数量 × 当日涨跌额），无行情时为 null。 */
  dailyPnl: number | null;
  firstBuyAt: string | null;
  ytdDividendReceived: number;
  expectedDividend: number;
  dividendYieldTtm: number | null;
}

export interface MilestoneDefinition {
  id: string;
  threshold: number;
  emoji: string;
  name: string;
  caption: string;
}

export interface MilestoneState extends MilestoneDefinition {
  lit: boolean;
  progress: number;
}

export interface PortfolioSummaryView {
  year: number;
  ytdReceived: number;
  expectedDividend: number;
  dailyAverage: number;
  totalMarketValue: number;
  totalCost: number;
  /** 参考浮动盈亏合计（已扣预估卖出费用）。 */
  unrealizedPnl: number;
  /** 组合当日盈亏合计。 */
  dailyPnl: number;
  milestones: MilestoneState[];
  litMilestoneCount: number;
  lastRefreshedAt: string | null;
}

export interface PortfolioDividendRecord {
  id: string;
  accountId: string;
  symbol: string;
  name: string;
  kind: InstrumentKind;
  exDividendDate: string;
  recordDate: string | null;
  payDate: string | null;
  cashPerShare: number;
  eligibleQuantity: number;
  cashAmount: number;
  status: DividendRecordStatus;
  source: DividendRecordSource;
}

export interface DividendCalendarDay {
  date: string;
  items: Array<{
    accountId?: string;
    symbol: string;
    name: string;
    kind: InstrumentKind;
    cashAmount: number;
    status: 'confirmed' | 'expected' | 'projected';
  }>;
}

export interface PortfolioRefreshResult {
  synced: number;
  estimated: number;
}

export interface RealizedTradeView {
  id: string;
  accountId: string;
  symbol: string;
  name: string;
  kind: InstrumentKind;
  tradeAt: string;
  quantity: number;
  sellPrice: number;
  sellFees: number;
  proceeds: number;
  costBasis: number;
  realizedPnl: number;
  returnPercent: number | null;
  note: string;
  remainingQuantity: number;
}

export interface ClosedPositionSummary {
  accountId: string;
  symbol: string;
  name: string;
  kind: InstrumentKind;
  totalRealizedPnl: number;
  sellCount: number;
  totalQuantitySold: number;
  firstSellAt: string;
  lastSellAt: string;
}

export interface RealizedHistorySummary {
  totalRealizedPnl: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
}

export interface PortfolioRealizedHistoryView {
  trades: RealizedTradeView[];
  closedPositions: ClosedPositionSummary[];
  summary: RealizedHistorySummary;
}

export interface PnlCalendarDay {
  date: string;
  totalPnl: number;
  dividendPnl: number;
  positionPnl: number;
}

export interface PnlCalendarSummary {
  totalPnl: number;
  positiveDays: number;
  negativeDays: number;
  activeDays: number;
  dividendPnl: number;
}

export interface PnlCalendarMonthSummary {
  month: string;
  summary: PnlCalendarSummary;
}

export interface PnlCalendarSyncItem {
  symbol: string;
  name: string;
  synced: boolean;
  skipped: boolean;
  error?: string;
}

export interface PortfolioPnlCalendarSyncResult {
  items: PnlCalendarSyncItem[];
}

export interface PortfolioPnlCalendarView {
  month: string;
  days: PnlCalendarDay[];
  summary: PnlCalendarSummary;
  windowStart: string;
  windowEnd: string;
  missingBarSymbols: string[];
}

export interface PortfolioLedgerEntry {
  id: string;
  accountId: string;
  symbol: string;
  kind: InstrumentKind;
  side: PortfolioLedgerSide;
  quantity: number;
  price: number;
  fees: number;
  tradeAt: string;
  planId: string | null;
  note: string;
  source: PortfolioLedgerSource;
  sipOccurrenceId: string | null;
  createdAt: string;
}
