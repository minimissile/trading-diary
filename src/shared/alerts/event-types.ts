import type { TradeAlertCondition } from '../api.types';

export type AlertEventUserAction = 'acknowledged' | 'snoozed' | 'dismissed' | 'completed';

export interface AlertEvent {
  id: string;
  alertRuleId: string;
  symbol: string;
  title: string;
  condition: TradeAlertCondition;
  targetPrice: number;
  triggerPrice: number;
  triggeredAt: string;
  userAction: AlertEventUserAction | null;
}

export interface AlertPollResult {
  evaluatedSymbolCount: number;
  newlyTriggered: AlertEvent[];
}
