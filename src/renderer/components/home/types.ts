import type { TradeAlert, TradeEpisodeView, TradingPlan } from '../../../shared/api.types';
import type { FundSipOccurrenceView } from '../../../shared/sip/types';

export type QueueCategory = 'all' | 'reminder' | 'due' | 'review' | 'risk';

export interface ActionItem {
  id: string;
  priority: 'high' | 'medium' | 'low';
  category: Exclude<QueueCategory, 'all'>;
  type: string;
  symbol: string;
  code: string;
  description: string;
  price: string;
  change: string;
  status: string;
  statusTone: 'warning' | 'success' | 'violet' | 'blue';
  action: string;
  source?: TradingPlan | TradeAlert | TradeEpisodeView | FundSipOccurrenceView;
}
