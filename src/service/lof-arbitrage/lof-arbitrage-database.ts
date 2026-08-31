import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  CreateLofArbitrageRuleInput,
  LofArbitrageAlertEvent,
  LofArbitrageDirection,
  LofArbitrageRule,
  LofArbitrageRuleStatus,
  LofArbitrageSnapshot,
  LofWatchItem,
} from '../../shared/lof-arbitrage/types';

const RATE_SCALE = 1_000_000;
const MONEY_SCALE = 100;

function normalizeSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  if (!normalized) throw new Error('标的代码不能为空');
  return normalized;
}

function toRateMicros(rate: number): number {
  return Math.round(rate * RATE_SCALE);
}

function fromRateMicros(value: number): number {
  return value / RATE_SCALE;
}

function toAmountCents(amount: number): number {
  return Math.round(amount * MONEY_SCALE);
}

function fromAmountCents(value: number | null): number | null {
  if (value === null) return null;
  return value / MONEY_SCALE;
}

interface WatchRow {
  id: string;
  symbol: string;
  notes: string | null;
  created_at: string;
}

interface RuleRow {
  id: string;
  symbol: string | null;
  direction: LofArbitrageDirection;
  threshold_rate_micros: number;
  min_amount_cents: number | null;
  require_subscription_open: number;
  min_net_spread_micros: number | null;
  status: LofArbitrageRuleStatus;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: string;
  rule_id: string;
  symbol: string;
  title: string;
  premium_rate_micros: number;
  net_spread_micros: number | null;
  recommended_path_label: string | null;
  triggered_at: string;
  user_action: 'acknowledged' | 'dismissed' | null;
}

export class LofArbitrageDatabase {
  constructor(private readonly db: DatabaseSync) {}

  listWatchItems(): LofWatchItem[] {
    const rows = this.db
      .prepare('SELECT * FROM lof_watchlist ORDER BY created_at DESC')
      .all() as unknown as WatchRow[];
    return rows.map((row) => ({
      id: row.id,
      symbol: row.symbol,
      notes: row.notes,
      createdAt: row.created_at,
    }));
  }

  /** 从持仓流水中提取 LOF 代码（用于监控池自动并集）。 */
  listHeldLofSymbols(): string[] {
    const rows = this.db
      .prepare("SELECT DISTINCT symbol FROM portfolio_ledger WHERE kind = 'lof' ORDER BY symbol")
      .all() as Array<{ symbol: string }>;
    return rows.map((row) => row.symbol);
  }

  /** 首次使用时创建全市场可执行套利提醒（无需手动加监控）。 */
  ensureDefaultExecutableAlertRule(): LofArbitrageRule | null {
    const activeCount = this.db
      .prepare("SELECT COUNT(*) AS count FROM lof_arbitrage_rules WHERE status = 'active'")
      .get() as { count: number };
    if (activeCount.count > 0) return null;

    return this.createRule({
      direction: 'both',
      thresholdRate: 0.02,
      requireSubscriptionOpen: true,
      symbol: null,
      minAmount: 100_000,
    });
  }

  hasRecentTrigger(ruleId: string, symbol: string, cooldownMs: number): boolean {
    const since = new Date(Date.now() - cooldownMs).toISOString();
    const row = this.db
      .prepare(
        `
        SELECT id FROM lof_arbitrage_events
        WHERE rule_id = ? AND symbol = ? AND triggered_at >= ?
        LIMIT 1
      `,
      )
      .get(ruleId, symbol, since) as { id: string } | undefined;
    return Boolean(row);
  }

  addWatchItem(symbolInput: string, notes?: string | null): LofWatchItem {
    const symbol = normalizeSymbol(symbolInput);
    const existing = this.db.prepare('SELECT id FROM lof_watchlist WHERE symbol = ?').get(symbol) as
      | { id: string }
      | undefined;
    if (existing) {
      return this.getWatchItem(existing.id);
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare('INSERT INTO lof_watchlist (id, symbol, notes, created_at) VALUES (?, ?, ?, ?)')
      .run(id, symbol, notes?.trim() || null, now);
    return this.getWatchItem(id);
  }

  removeWatchItem(id: string): void {
    const result = this.db.prepare('DELETE FROM lof_watchlist WHERE id = ?').run(id);
    if (result.changes === 0) throw new Error('监控项不存在');
  }

  getWatchItem(id: string): LofWatchItem {
    const row = this.db.prepare('SELECT * FROM lof_watchlist WHERE id = ?').get(id) as unknown as WatchRow | undefined;
    if (!row) throw new Error('监控项不存在');
    return {
      id: row.id,
      symbol: row.symbol,
      notes: row.notes,
      createdAt: row.created_at,
    };
  }

  listRules(): LofArbitrageRule[] {
    const rows = this.db
      .prepare('SELECT * FROM lof_arbitrage_rules ORDER BY updated_at DESC')
      .all() as unknown as RuleRow[];
    return rows.map((row) => this.mapRule(row));
  }

  listActiveRules(): LofArbitrageRule[] {
    const rows = this.db
      .prepare("SELECT * FROM lof_arbitrage_rules WHERE status = 'active' ORDER BY updated_at DESC")
      .all() as unknown as RuleRow[];
    return rows.map((row) => this.mapRule(row));
  }

  createRule(input: CreateLofArbitrageRuleInput): LofArbitrageRule {
    const id = randomUUID();
    const now = new Date().toISOString();
    const symbol = input.symbol ? normalizeSymbol(input.symbol) : null;

    this.db
      .prepare(
        `
        INSERT INTO lof_arbitrage_rules (
          id, symbol, direction, threshold_rate_micros, min_amount_cents,
          require_subscription_open, min_net_spread_micros, status,
          last_triggered_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?)
      `,
      )
      .run(
        id,
        symbol,
        input.direction,
        toRateMicros(input.thresholdRate),
        input.minAmount != null ? toAmountCents(input.minAmount) : null,
        input.requireSubscriptionOpen === false ? 0 : 1,
        input.minNetSpread != null ? toRateMicros(input.minNetSpread) : null,
        now,
        now,
      );

    return this.getRule(id);
  }

  setRuleStatus(id: string, status: LofArbitrageRuleStatus): LofArbitrageRule {
    this.getRule(id);
    const now = new Date().toISOString();
    this.db.prepare('UPDATE lof_arbitrage_rules SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id);
    return this.getRule(id);
  }

  deleteRule(id: string): void {
    const result = this.db.prepare('DELETE FROM lof_arbitrage_rules WHERE id = ?').run(id);
    if (result.changes === 0) throw new Error('提醒规则不存在');
  }

  getRule(id: string): LofArbitrageRule {
    const row = this.db.prepare('SELECT * FROM lof_arbitrage_rules WHERE id = ?').get(id) as unknown as RuleRow | undefined;
    if (!row) throw new Error('提醒规则不存在');
    return this.mapRule(row);
  }

  saveSnapshot(snapshot: LofArbitrageSnapshot): void {
    this.db
      .prepare(
        `
        INSERT INTO lof_arbitrage_snapshots (
          id, symbol, market_price_micros, reference_nav_micros, premium_rate_micros,
          subscription_status, amount_cents, fetched_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        randomUUID(),
        snapshot.symbol,
        snapshot.marketPrice != null ? toAmountCents(snapshot.marketPrice) : null,
        snapshot.referenceNav != null ? toAmountCents(snapshot.referenceNav) : null,
        snapshot.premiumRate != null ? toRateMicros(snapshot.premiumRate) : null,
        snapshot.subscriptionStatus,
        snapshot.amount != null ? toAmountCents(snapshot.amount) : null,
        snapshot.fetchedAt,
      );

    this.pruneSnapshots(snapshot.symbol);
  }

  listRecentEvents(limit = 50): LofArbitrageAlertEvent[] {
    const rows = this.db
      .prepare('SELECT * FROM lof_arbitrage_events ORDER BY triggered_at DESC LIMIT ?')
      .all(limit) as unknown as EventRow[];
    return rows.map((row) => this.mapEvent(row));
  }

  listPendingEvents(limit = 20): LofArbitrageAlertEvent[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM lof_arbitrage_events WHERE user_action IS NULL ORDER BY triggered_at DESC LIMIT ?",
      )
      .all(limit) as unknown as EventRow[];
    return rows.map((row) => this.mapEvent(row));
  }

  setEventAction(id: string, action: 'acknowledged' | 'dismissed'): LofArbitrageAlertEvent {
    const row = this.db.prepare('SELECT * FROM lof_arbitrage_events WHERE id = ?').get(id) as unknown as EventRow | undefined;
    if (!row) throw new Error('提醒事件不存在');
    this.db.prepare('UPDATE lof_arbitrage_events SET user_action = ? WHERE id = ?').run(action, id);
    return this.mapEvent({ ...row, user_action: action });
  }

  recordTrigger(input: {
    ruleId: string;
    symbol: string;
    title: string;
    premiumRate: number;
    netSpread: number | null;
    recommendedPathLabel: string | null;
  }): LofArbitrageAlertEvent {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
        INSERT INTO lof_arbitrage_events (
          id, rule_id, symbol, title, premium_rate_micros, net_spread_micros,
          recommended_path_label, triggered_at, user_action
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `,
      )
      .run(
        id,
        input.ruleId,
        input.symbol,
        input.title,
        toRateMicros(input.premiumRate),
        input.netSpread != null ? toRateMicros(input.netSpread) : null,
        input.recommendedPathLabel,
        now,
      );

    this.db
      .prepare('UPDATE lof_arbitrage_rules SET last_triggered_at = ?, updated_at = ? WHERE id = ?')
      .run(now, now, input.ruleId);

    return this.mapEvent({
      id,
      rule_id: input.ruleId,
      symbol: input.symbol,
      title: input.title,
      premium_rate_micros: toRateMicros(input.premiumRate),
      net_spread_micros: input.netSpread != null ? toRateMicros(input.netSpread) : null,
      recommended_path_label: input.recommendedPathLabel,
      triggered_at: now,
      user_action: null,
    });
  }

  private pruneSnapshots(symbol: string): void {
    this.db
      .prepare(
        `
        DELETE FROM lof_arbitrage_snapshots
        WHERE symbol = ?
          AND id NOT IN (
            SELECT id FROM lof_arbitrage_snapshots
            WHERE symbol = ?
            ORDER BY fetched_at DESC
            LIMIT 500
          )
      `,
      )
      .run(symbol, symbol);
  }

  private mapRule(row: RuleRow): LofArbitrageRule {
    return {
      id: row.id,
      symbol: row.symbol,
      direction: row.direction,
      thresholdRate: fromRateMicros(row.threshold_rate_micros),
      minAmount: fromAmountCents(row.min_amount_cents),
      requireSubscriptionOpen: row.require_subscription_open === 1,
      minNetSpread: row.min_net_spread_micros != null ? fromRateMicros(row.min_net_spread_micros) : null,
      status: row.status,
      lastTriggeredAt: row.last_triggered_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapEvent(row: EventRow): LofArbitrageAlertEvent {
    return {
      id: row.id,
      ruleId: row.rule_id,
      symbol: row.symbol,
      title: row.title,
      premiumRate: fromRateMicros(row.premium_rate_micros),
      netSpread: row.net_spread_micros != null ? fromRateMicros(row.net_spread_micros) : null,
      recommendedPathLabel: row.recommended_path_label,
      triggeredAt: row.triggered_at,
      userAction: row.user_action,
    };
  }
}
