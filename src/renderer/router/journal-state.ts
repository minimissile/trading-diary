import type { TradeDirection } from '../../shared/api.types';

/** 从持仓流水或回合跳转复盘时的预填数据。 */
export interface JournalReviewDraft {
  episodeId?: string;
  symbol: string;
  title: string;
  direction: TradeDirection;
  planned: boolean;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  fees: number;
  tradeAt: string;
}

export interface JournalLocationState {
  planId?: string;
  episodeId?: string;
  openReview?: boolean;
  openExecution?: boolean;
  reviewDraft?: JournalReviewDraft;
}
