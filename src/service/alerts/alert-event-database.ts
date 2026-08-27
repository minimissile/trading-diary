import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { TradeAlertCondition } from '../../shared/api.types';
import type { AlertEvent, AlertEventUserAction } from '../../shared/alerts/event-types';

const PRICE_SCALE = 10_000;

function fromScaledInteger(value: number, scale: number): number {
  return value / scale;
}

interface AlertEventRow {
  id: string;
  alert_rule_id: string;
  symbol: string;
  title: string;
  condition: TradeAlertCondition;
  target_price_micros: number;
  trigger_price_micros: number;
  triggered_at: string;
  user_action: AlertEventUserAction | null;
}

export class AlertEventDatabase {
  constructor(private readonly db: DatabaseSync) {}

  recordTrigger(input: {
    alertRuleId: string;
    symbol: string;
    title: string;
    condition: TradeAlertCondition;
    targetPriceMicros: number;
    triggerPriceMicros: number;
    triggeredAt: string;
  }): AlertEvent {
    const id = randomUUID();
    this.db
      .prepare(
        `
        INSERT INTO alert_events (
          id, alert_rule_id, symbol, title, condition,
          target_price_micros, trigger_price_micros, triggered_at, user_action
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `,
      )
      .run(
        id,
        input.alertRuleId,
        input.symbol,
        input.title,
        input.condition,
        input.targetPriceMicros,
        input.triggerPriceMicros,
        input.triggeredAt,
      );
    return this.getEvent(id);
  }

  listEvents(limit = 100): AlertEvent[] {
    const rows = this.db
      .prepare('SELECT * FROM alert_events ORDER BY triggered_at DESC LIMIT ?')
      .all(limit) as unknown as AlertEventRow[];
    return rows.map((row) => this.mapEvent(row));
  }

  setUserAction(id: string, action: AlertEventUserAction): AlertEvent {
    this.getEvent(id);
    this.db.prepare('UPDATE alert_events SET user_action = ? WHERE id = ?').run(action, id);
    return this.getEvent(id);
  }

  getEvent(id: string): AlertEvent {
    const row = this.db.prepare('SELECT * FROM alert_events WHERE id = ?').get(id) as unknown as AlertEventRow | undefined;
    if (!row) throw new Error('提醒触发记录不存在');
    return this.mapEvent(row);
  }

  private mapEvent(row: AlertEventRow): AlertEvent {
    return {
      id: row.id,
      alertRuleId: row.alert_rule_id,
      symbol: row.symbol,
      title: row.title,
      condition: row.condition,
      targetPrice: fromScaledInteger(row.target_price_micros, PRICE_SCALE),
      triggerPrice: fromScaledInteger(row.trigger_price_micros, PRICE_SCALE),
      triggeredAt: row.triggered_at,
      userAction: row.user_action,
    };
  }
}
