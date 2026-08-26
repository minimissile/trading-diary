import type { InstrumentKind } from '../market/types';

export type PortfolioLedgerSide = 'buy' | 'sell' | 'dividend_reinvest';
export type PortfolioLedgerSource = 'manual' | 'csv' | 'plan';
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
}

export interface PortfolioPositionView {
  symbol: string;
  name: string;
  kind: InstrumentKind;
  quantity: number;
  avgCost: number;
  marketPrice: number | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
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
  unrealizedPnl: number;
  milestones: MilestoneState[];
  litMilestoneCount: number;
  lastRefreshedAt: string | null;
}

export interface PortfolioDividendRecord {
  id: string;
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
  createdAt: string;
}
