import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { TradeDirection } from '../../shared/api.types';
import type {
  CreateExecutionInput,
  Execution,
  ExecutionSource,
  TradeEpisodeStatus,
  TradeEpisodeView,
} from '../../shared/episodes/types';
import { computeEpisodeMetrics } from './episode-calculator';

const PRICE_SCALE = 10_000;
const QUANTITY_SCALE = 10_000;
const MONEY_SCALE = 100;

function toScaledInteger(value: number, scale: number): number {
  if (!Number.isFinite(value)) throw new Error('数值必须是有限数字');
  return Math.round(value * scale);
}

function fromScaledInteger(value: number, scale: number): number {
  return value / scale;
}

function normalizeSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  if (!normalized) throw new Error('标的代码不能为空');
  return normalized;
}

interface EpisodeRow {
  id: string;
  account_id: string;
  symbol: string;
  direction: TradeDirection;
  plan_id: string | null;
  status: TradeEpisodeStatus;
  title: string;
  opened_at: string;
  closed_at: string | null;
  review_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ExecutionRow {
  id: string;
  episode_id: string;
  account_id: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity_micros: number;
  price_micros: number;
  fees_cents: number;
  trade_at: string;
  note: string;
  idempotency_key: string | null;
  source: ExecutionSource;
  created_at: string;
}

export class EpisodeDatabase {
  constructor(private readonly db: DatabaseSync) {}

  resolveAccountId(accountId?: string): string {
    const row = accountId
      ? (this.db.prepare('SELECT id FROM portfolio_accounts WHERE id = ?').get(accountId) as { id: string } | undefined)
      : (this.db.prepare('SELECT id FROM portfolio_accounts WHERE is_default = 1 LIMIT 1').get() as { id: string } | undefined);
    if (!row) throw new Error('未找到可用交易账户，请先在账户管理中创建');
    return row.id;
  }

  listEpisodes(accountId?: string): TradeEpisodeView[] {
    const resolvedAccountId = accountId ? this.resolveAccountId(accountId) : undefined;
    const rows = resolvedAccountId
      ? (this.db
          .prepare('SELECT * FROM trade_episodes WHERE account_id = ? ORDER BY updated_at DESC')
          .all(resolvedAccountId) as unknown as EpisodeRow[])
      : (this.db.prepare('SELECT * FROM trade_episodes ORDER BY updated_at DESC').all() as unknown as EpisodeRow[]);
    return rows.map((row) => this.buildEpisodeView(row));
  }

  getEpisode(id: string): TradeEpisodeView {
    const row = this.db.prepare('SELECT * FROM trade_episodes WHERE id = ?').get(id) as unknown as EpisodeRow | undefined;
    if (!row) throw new Error('交易回合不存在');
    return this.buildEpisodeView(row);
  }

  addExecution(input: CreateExecutionInput): TradeEpisodeView {
    const accountId = this.resolveAccountId(input.accountId);
    const symbol = normalizeSymbol(input.symbol);
    const quantityMicros = toScaledInteger(input.quantity, QUANTITY_SCALE);
    const priceMicros = toScaledInteger(input.price, PRICE_SCALE);
    const feesCents = toScaledInteger(input.fees ?? 0, MONEY_SCALE);
    if (quantityMicros <= 0 || priceMicros <= 0 || feesCents < 0) throw new Error('成交价格和数量必须大于 0');

    const direction: TradeDirection = input.side === 'buy' ? 'long' : 'long';
    const openEpisode = this.findOpenEpisode(accountId, symbol, direction);

    if (input.side === 'sell' && !openEpisode) {
      throw new Error('当前没有持仓中的交易回合，请先记录买入成交');
    }

    const now = new Date().toISOString();
    const episodeId = openEpisode?.id ?? randomUUID();
    const executionId = randomUUID();
    const idempotencyKey = buildIdempotencyKey(accountId, symbol, input.side, input.tradeAt, input.quantity, input.price);

    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (!openEpisode) {
        const title = input.planId ? this.planTitle(input.planId, symbol) : `${symbol} 交易回合`;
        this.db
          .prepare(
            `
            INSERT INTO trade_episodes (
              id, account_id, symbol, direction, plan_id, status, title,
              opened_at, closed_at, review_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 'open', ?, ?, NULL, NULL, ?, ?)
          `,
          )
          .run(episodeId, accountId, symbol, direction, input.planId ?? null, title, input.tradeAt, now, now);
      }

      this.db
        .prepare(
          `
          INSERT INTO executions (
            id, episode_id, account_id, symbol, side, quantity_micros, price_micros,
            fees_cents, trade_at, note, idempotency_key, source, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          executionId,
          episodeId,
          accountId,
          symbol,
          input.side,
          quantityMicros,
          priceMicros,
          feesCents,
          input.tradeAt,
          (input.note ?? '').trim(),
          idempotencyKey,
          input.source ?? 'manual',
          now,
        );

      const metrics = computeEpisodeMetrics(direction, this.listExecutionInputs(episodeId));
      if (metrics.status === 'closed') {
        this.db
          .prepare("UPDATE trade_episodes SET status = 'closed', closed_at = ?, updated_at = ? WHERE id = ?")
          .run(input.tradeAt, now, episodeId);
      } else {
        this.db.prepare('UPDATE trade_episodes SET updated_at = ? WHERE id = ?').run(now, episodeId);
      }

      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed: executions.idempotency_key')) {
        throw new Error('该成交已存在，请勿重复录入', { cause: error });
      }
      throw error;
    }

    return this.getEpisode(episodeId);
  }

  linkReview(episodeId: string, reviewId: string): void {
    this.getEpisode(episodeId);
    const now = new Date().toISOString();
    this.db.prepare('UPDATE trade_episodes SET review_id = ?, updated_at = ? WHERE id = ?').run(reviewId, now, episodeId);
  }

  listPendingReview(accountId?: string): TradeEpisodeView[] {
    return this.listEpisodes(accountId).filter((episode) => episode.status === 'closed' && episode.reviewId === null);
  }

  private findOpenEpisode(accountId: string, symbol: string, direction: TradeDirection): EpisodeRow | undefined {
    return this.db
      .prepare(
        "SELECT * FROM trade_episodes WHERE account_id = ? AND symbol = ? AND direction = ? AND status = 'open' LIMIT 1",
      )
      .get(accountId, symbol, direction) as unknown as EpisodeRow | undefined;
  }

  private listExecutionInputs(episodeId: string): Array<{ side: 'buy' | 'sell'; quantity: number; price: number; fees: number; tradeAt: string }> {
    const rows = this.db
      .prepare('SELECT * FROM executions WHERE episode_id = ? ORDER BY trade_at ASC, created_at ASC')
      .all(episodeId) as unknown as ExecutionRow[];
    return rows.map((row) => ({
      side: row.side,
      quantity: fromScaledInteger(row.quantity_micros, QUANTITY_SCALE),
      price: fromScaledInteger(row.price_micros, PRICE_SCALE),
      fees: fromScaledInteger(row.fees_cents, MONEY_SCALE),
      tradeAt: row.trade_at,
    }));
  }

  private listExecutions(episodeId: string): Execution[] {
    const rows = this.db
      .prepare('SELECT * FROM executions WHERE episode_id = ? ORDER BY trade_at ASC, created_at ASC')
      .all(episodeId) as unknown as ExecutionRow[];
    return rows.map((row) => this.mapExecution(row));
  }

  private buildEpisodeView(row: EpisodeRow): TradeEpisodeView {
    const executions = this.listExecutions(row.id);
    const metrics = computeEpisodeMetrics(
      row.direction,
      executions.map((execution) => ({
        side: execution.side,
        quantity: execution.quantity,
        price: execution.price,
        fees: execution.fees,
        tradeAt: execution.tradeAt,
      })),
    );

    return {
      id: row.id,
      accountId: row.account_id,
      symbol: row.symbol,
      direction: row.direction,
      planId: row.plan_id,
      status: row.review_id ? 'closed' : metrics.status,
      title: row.title,
      openedAt: row.opened_at,
      closedAt: row.closed_at,
      reviewId: row.review_id,
      netQuantity: metrics.netQuantity,
      avgEntryPrice: metrics.avgEntryPrice,
      avgExitPrice: metrics.avgExitPrice,
      closedQuantity: metrics.closedQuantity,
      totalFees: metrics.totalFees,
      realizedPnl: metrics.realizedPnl,
      executions,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapExecution(row: ExecutionRow): Execution {
    return {
      id: row.id,
      episodeId: row.episode_id,
      accountId: row.account_id,
      symbol: row.symbol,
      side: row.side,
      quantity: fromScaledInteger(row.quantity_micros, QUANTITY_SCALE),
      price: fromScaledInteger(row.price_micros, PRICE_SCALE),
      fees: fromScaledInteger(row.fees_cents, MONEY_SCALE),
      tradeAt: row.trade_at,
      note: row.note,
      source: row.source,
      createdAt: row.created_at,
    };
  }

  private planTitle(planId: string, fallbackSymbol: string): string {
    const row = this.db.prepare('SELECT name FROM trading_plans WHERE id = ?').get(planId) as { name: string } | undefined;
    return row?.name ?? `${fallbackSymbol} 交易回合`;
  }
}

function buildIdempotencyKey(
  accountId: string,
  symbol: string,
  side: string,
  tradeAt: string,
  quantity: number,
  price: number,
): string {
  const payload = `${accountId}|${symbol}|${side}|${tradeAt}|${quantity}|${price}`;
  return createHash('sha256').update(payload).digest('hex');
}
