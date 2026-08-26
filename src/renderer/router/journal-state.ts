import type { TradeDirection } from '../../shared/api.types';

/** 从持仓流水跳转复盘时的预填数据。 */
export interface JournalReviewDraft {
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
  openReview?: boolean;
  reviewDraft?: JournalReviewDraft;
}
