import type { TradeDirection } from '../api.types';

export type ExecutionSide = 'buy' | 'sell';
export type TradeEpisodeStatus = 'open' | 'closed';
export type ExecutionSource = 'manual' | 'csv' | 'plan';

/** 单条成交事实。 */
export interface Execution {
  id: string;
  episodeId: string;
  accountId: string;
  symbol: string;
  side: ExecutionSide;
  quantity: number;
  price: number;
  fees: number;
  tradeAt: string;
  note: string;
  source: ExecutionSource;
  createdAt: string;
}

/** 交易回合聚合视图（含自动计算的盈亏口径）。 */
export interface TradeEpisodeView {
  id: string;
  accountId: string;
  symbol: string;
  direction: TradeDirection;
  planId: string | null;
  status: TradeEpisodeStatus;
  title: string;
  openedAt: string;
  closedAt: string | null;
  reviewId: string | null;
  netQuantity: number;
  avgEntryPrice: number | null;
  avgExitPrice: number | null;
  closedQuantity: number;
  totalFees: number;
  realizedPnl: number | null;
  executions: Execution[];
  createdAt: string;
  updatedAt: string;
}

/** 录入成交输入。 */
export interface CreateExecutionInput {
  accountId?: string;
  symbol: string;
  side: ExecutionSide;
  quantity: number;
  price: number;
  fees?: number;
  tradeAt: string;
  planId?: string | null;
  note?: string;
  source?: ExecutionSource;
}
