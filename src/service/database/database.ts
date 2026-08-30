import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  AssetStats,
  CreateTradeAlertInput,
  CreateTradeReviewInput,
  CreateTradingPlanInput,
  QuoteEvaluationResult,
  TradeAlert,
  TradeAlertCondition,
  TradeAlertRole,
  TradeAlertStatus,
  TradeDirection,
  TradeReview,
  TradingPlan,
  TradingPlanStatus,
  WorkspaceSnapshot,
} from '../../shared/api.types';
import { migrations } from './migrations';
import { PortfolioDatabase } from '../portfolio/portfolio-database';
import { MarketDailyBarDatabase } from '../market/market-daily-bar-database';
import { FundProfileDatabase } from '../market/fund-profile-database';
import { AccountDatabase } from '../accounts/account-database';
import { EpisodeDatabase } from '../episodes/episode-database';
import { PlaybookDatabase } from '../playbook/playbook-database';
import { AlertEventDatabase } from '../alerts/alert-event-database';
import { SipDatabase } from '../sip/sip-database';

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

export interface AssetRecord {
  hash: string;
  originalName: string;
  mediaType: string;
  originalBytes: number;
  previewBytes: number;
  width: number | null;
  height: number | null;
  originalPath: string;
  previewPath: string;
  createdAt: string;
}

interface VersionRow {
  version: number;
}

interface SqliteVersionRow {
  version: string;
}

interface AssetPathRow {
  original_path: string;
  preview_path: string;
}

interface TradingPlanRow {
  id: string;
  symbol: string;
  name: string;
  direction: TradeDirection;
  thesis: string;
  entry_price_micros: number;
  stop_price_micros: number;
  target_price_micros: number | null;
  risk_amount_cents: number;
  status: TradingPlanStatus;
  created_at: string;
  updated_at: string;
}

interface TradeAlertRow {
  id: string;
  plan_id: string | null;
  symbol: string;
  title: string;
  condition: TradeAlertCondition;
  role: TradeAlertRole;
  target_price_micros: number;
  last_price_micros: number | null;
  status: TradeAlertStatus;
  triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

interface TradeReviewRow {
  id: string;
  plan_id: string | null;
  episode_id: string | null;
  symbol: string;
  title: string;
  direction: TradeDirection;
  planned: 0 | 1;
  entry_price_micros: number;
  exit_price_micros: number;
  quantity_micros: number;
  fees_cents: number;
  pnl_cents: number;
  execution_score: number;
  summary: string;
  lesson: string;
  created_at: string;
}

const planTransitions: Readonly<Record<TradingPlanStatus, readonly TradingPlanStatus[]>> = {
  draft: ['watching', 'cancelled'],
  watching: ['holding', 'cancelled'],
  holding: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export class AppDatabase {
  readonly filePath: string;
  readonly portfolio: PortfolioDatabase;
  readonly marketDailyBars: MarketDailyBarDatabase;
  readonly fundProfiles: FundProfileDatabase;
  readonly accounts: AccountDatabase;
  readonly episodes: EpisodeDatabase;
  readonly playbook: PlaybookDatabase;
  readonly alertEvents: AlertEventDatabase;
  readonly sip: SipDatabase;
  private readonly db: DatabaseSync;

  constructor(filePath: string) {
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.db = new DatabaseSync(filePath, {
      timeout: 5_000,
      allowExtension: false,
      enableForeignKeyConstraints: true,
      defensive: true,
    });

    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      ) STRICT;
    `);

    this.applyMigrations();
    this.portfolio = new PortfolioDatabase(this.db);
    this.marketDailyBars = new MarketDailyBarDatabase(this.db);
    this.fundProfiles = new FundProfileDatabase(this.db);
    this.accounts = new AccountDatabase(this.db);
    this.episodes = new EpisodeDatabase(this.db);
    this.playbook = new PlaybookDatabase(this.db);
    this.alertEvents = new AlertEventDatabase(this.db);
    this.sip = new SipDatabase(this.db);
    if (this.schemaVersion() >= 3) {
      this.portfolio.ensureDefaultAccount();
    }
    if (this.schemaVersion() >= 4) {
      this.accounts.ensureDefaults('default');
    }
  }

  close(): void {
    this.db.close();
  }

  checkpoint(): void {
    this.db.exec('PRAGMA wal_checkpoint(FULL)');
  }

  rewriteAssetPaths(dataDir: string): void {
    const assetsRoot = path.join(dataDir, 'assets');
    interface AssetPathRow {
      hash: string;
      original_path: string;
    }
    const rows = this.db.prepare('SELECT hash, original_path FROM assets').all() as unknown as AssetPathRow[];
    const update = this.db.prepare('UPDATE assets SET original_path = ?, preview_path = ? WHERE hash = ?');
    for (const row of rows) {
      const extension = path.extname(row.original_path).slice(1) || 'bin';
      const shard = path.join(row.hash.slice(0, 2), row.hash.slice(2, 4));
      update.run(
        path.join(assetsRoot, 'original', shard, `${row.hash}.${extension}`),
        path.join(assetsRoot, 'preview', shard, `${row.hash}.webp`),
        row.hash,
      );
    }
  }

  countTradingPlans(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM trading_plans').get() as { count: number };
    return row.count;
  }

  countTradeAlerts(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM alert_rules').get() as { count: number };
    return row.count;
  }

  countTradeReviews(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM trade_reviews').get() as { count: number };
    return row.count;
  }

  sqliteVersion(): string {
    const row = this.db.prepare('SELECT sqlite_version() AS version').get() as unknown as SqliteVersionRow;
    return row.version;
  }

  schemaVersion(): number {
    const row = this.db
      .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations')
      .get() as unknown as VersionRow;
    return row.version;
  }

  hasAsset(hash: string): boolean {
    return this.db.prepare('SELECT 1 FROM assets WHERE hash = ? LIMIT 1').get(hash) !== undefined;
  }

  insertAsset(asset: AssetRecord): void {
    this.db
      .prepare(
        `
        INSERT OR IGNORE INTO assets (
          hash, original_name, media_type, original_bytes, preview_bytes,
          width, height, original_path, preview_path, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        asset.hash,
        asset.originalName,
        asset.mediaType,
        asset.originalBytes,
        asset.previewBytes,
        asset.width,
        asset.height,
        asset.originalPath,
        asset.previewPath,
        asset.createdAt,
      );
  }

  assetStats(): AssetStats {
    const row = this.db
      .prepare(
        `
        SELECT
          COUNT(*) AS count,
          COALESCE(SUM(original_bytes), 0) AS originalBytes,
          COALESCE(SUM(preview_bytes), 0) AS previewBytes
        FROM assets
      `,
      )
      .get() as unknown as AssetStats;

    return row;
  }

  assetPath(hash: string, variant: 'original' | 'preview'): string | null {
    const row = this.db.prepare('SELECT original_path, preview_path FROM assets WHERE hash = ?').get(hash) as unknown as
      AssetPathRow | undefined;
    if (!row) return null;
    return variant === 'preview' ? row.preview_path : row.original_path;
  }

  listTradingPlans(): TradingPlan[] {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM trading_plans
        ORDER BY
          CASE status
            WHEN 'holding' THEN 0
            WHEN 'watching' THEN 1
            WHEN 'draft' THEN 2
            WHEN 'completed' THEN 3
            ELSE 4
          END,
          updated_at DESC
      `,
      )
      .all() as unknown as TradingPlanRow[];

    return rows.map((row) => this.mapTradingPlan(row));
  }

  createTradingPlan(input: CreateTradingPlanInput): TradingPlan {
    this.assertPlanPrices(input);
    const id = randomUUID();
    const now = new Date().toISOString();
    const status: TradingPlanStatus = input.activateNow ? 'watching' : 'draft';
    const symbol = normalizeSymbol(input.symbol);

    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare(
          `
          INSERT INTO trading_plans (
            id, symbol, name, direction, thesis, entry_price_micros, stop_price_micros,
            target_price_micros, risk_amount_cents, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          id,
          symbol,
          input.name.trim(),
          input.direction,
          input.thesis.trim(),
          toScaledInteger(input.entryPrice, PRICE_SCALE),
          toScaledInteger(input.stopPrice, PRICE_SCALE),
          input.targetPrice === null ? null : toScaledInteger(input.targetPrice, PRICE_SCALE),
          toScaledInteger(input.riskAmount, MONEY_SCALE),
          status,
          now,
          now,
        );

      if (status === 'watching') this.insertPlanAlert(id, 'entry', now);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }

    return this.getTradingPlan(id);
  }

  setTradingPlanStatus(id: string, status: TradingPlanStatus): TradingPlan {
    const current = this.getTradingPlan(id);
    if (current.status === status) return current;
    if (!planTransitions[current.status].includes(status)) {
      throw new Error(`计划不能从“${current.status}”切换到“${status}”`);
    }

    const now = new Date().toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('UPDATE trading_plans SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id);

      if (status === 'watching') {
        this.insertPlanAlert(id, 'entry', now);
      } else if (status === 'holding') {
        this.db
          .prepare(
            `UPDATE alert_rules SET status = 'completed', updated_at = ?
             WHERE plan_id = ? AND role = 'entry' AND status IN ('active', 'triggered')`,
          )
          .run(now, id);
        this.insertPlanAlert(id, 'stop', now);
        if (current.targetPrice !== null) this.insertPlanAlert(id, 'target', now);
      } else if (status === 'completed' || status === 'cancelled') {
        this.db
          .prepare(
            `UPDATE alert_rules SET status = 'disabled', updated_at = ?
             WHERE plan_id = ? AND status IN ('active', 'triggered')`,
          )
          .run(now, id);
      }

      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }

    return this.getTradingPlan(id);
  }

  listTradeAlerts(): TradeAlert[] {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM alert_rules
        ORDER BY
          CASE status WHEN 'triggered' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,
          updated_at DESC
      `,
      )
      .all() as unknown as TradeAlertRow[];
    return rows.map((row) => this.mapTradeAlert(row));
  }

  createTradeAlert(input: CreateTradeAlertInput): TradeAlert {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
        INSERT INTO alert_rules (
          id, plan_id, symbol, title, condition, role, target_price_micros,
          last_price_micros, status, triggered_at, created_at, updated_at
        ) VALUES (?, NULL, ?, ?, ?, 'custom', ?, NULL, 'active', NULL, ?, ?)
      `,
      )
      .run(
        id,
        normalizeSymbol(input.symbol),
        input.title.trim(),
        input.condition,
        toScaledInteger(input.targetPrice, PRICE_SCALE),
        now,
        now,
      );
    return this.getTradeAlert(id);
  }

  setTradeAlertStatus(id: string, status: TradeAlertStatus): TradeAlert {
    this.getTradeAlert(id);
    const now = new Date().toISOString();
    const triggeredAt = status === 'active' ? null : undefined;

    if (triggeredAt === null) {
      this.db.prepare('UPDATE alert_rules SET status = ?, triggered_at = NULL, updated_at = ? WHERE id = ?').run(status, now, id);
    } else {
      this.db.prepare('UPDATE alert_rules SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id);
    }
    return this.getTradeAlert(id);
  }

  listActiveAlertSymbols(): string[] {
    const rows = this.db
      .prepare("SELECT DISTINCT symbol FROM alert_rules WHERE status = 'active' ORDER BY symbol")
      .all() as Array<{ symbol: string }>;
    return rows.map((row) => row.symbol);
  }

  evaluatePrice(symbolInput: string, price: number): QuoteEvaluationResult {
    const symbol = normalizeSymbol(symbolInput);
    const priceMicros = toScaledInteger(price, PRICE_SCALE);
    if (priceMicros <= 0) throw new Error('最新价必须大于 0');

    const rows = this.db
      .prepare("SELECT * FROM alert_rules WHERE symbol = ? AND status = 'active'")
      .all(symbol) as unknown as TradeAlertRow[];
    const triggeredIds: string[] = [];
    const newlyTriggeredEvents = [];
    const now = new Date().toISOString();

    this.db.exec('BEGIN IMMEDIATE');
    try {
      const updatePrice = this.db.prepare('UPDATE alert_rules SET last_price_micros = ?, updated_at = ? WHERE id = ?');
      const triggerAlert = this.db.prepare(
        "UPDATE alert_rules SET last_price_micros = ?, status = 'triggered', triggered_at = ?, updated_at = ? WHERE id = ?",
      );

      for (const row of rows) {
        const matched =
          row.condition === 'at_or_above' ? priceMicros >= row.target_price_micros : priceMicros <= row.target_price_micros;
        if (matched) {
          triggerAlert.run(priceMicros, now, now, row.id);
          triggeredIds.push(row.id);
          newlyTriggeredEvents.push(
            this.alertEvents.recordTrigger({
              alertRuleId: row.id,
              symbol: row.symbol,
              title: row.title,
              condition: row.condition,
              targetPriceMicros: row.target_price_micros,
              triggerPriceMicros: priceMicros,
              triggeredAt: now,
            }),
          );
        } else {
          updatePrice.run(priceMicros, now, row.id);
        }
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }

    const newlyTriggered = triggeredIds.map((id) => this.getTradeAlert(id));

    return {
      symbol,
      price: fromScaledInteger(priceMicros, PRICE_SCALE),
      evaluatedCount: rows.length,
      newlyTriggered,
      newlyTriggeredEvents,
    };
  }

  listTradeReviews(): TradeReview[] {
    const rows = this.db.prepare('SELECT * FROM trade_reviews ORDER BY created_at DESC').all() as unknown as TradeReviewRow[];
    return rows.map((row) => this.mapTradeReview(row));
  }

  createTradeReview(input: CreateTradeReviewInput): TradeReview {
    const entryPrice = toScaledInteger(input.entryPrice, PRICE_SCALE);
    const exitPrice = toScaledInteger(input.exitPrice, PRICE_SCALE);
    const quantity = toScaledInteger(input.quantity, QUANTITY_SCALE);
    const fees = toScaledInteger(input.fees, MONEY_SCALE);
    if (entryPrice <= 0 || exitPrice <= 0 || quantity <= 0 || fees < 0) throw new Error('成交价格和数量必须大于 0');

    if (input.planId) this.getTradingPlan(input.planId);
    if (input.episodeId) this.episodes.getEpisode(input.episodeId);
    const gross = (input.exitPrice - input.entryPrice) * input.quantity * (input.direction === 'long' ? 1 : -1);
    const pnl = Math.round((gross - input.fees) * MONEY_SCALE);
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare(
          `
        INSERT INTO trade_reviews (
          id, plan_id, episode_id, symbol, title, direction, planned, entry_price_micros, exit_price_micros,
          quantity_micros, fees_cents, pnl_cents, execution_score, summary, lesson, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          id,
          input.planId,
          input.episodeId ?? null,
          normalizeSymbol(input.symbol),
          input.title.trim(),
          input.direction,
          input.planned ? 1 : 0,
          entryPrice,
          exitPrice,
          quantity,
          fees,
          pnl,
          input.executionScore,
          input.summary.trim(),
          input.lesson.trim(),
          now,
        );

      if (input.episodeId) this.episodes.linkReview(input.episodeId, id);
      if (input.saveToPlaybook !== false && input.lesson.trim()) {
        this.playbook.createFromReview(id, normalizeSymbol(input.symbol), input.lesson.trim());
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.getTradeReview(id);
  }

  workspaceSnapshot(): WorkspaceSnapshot {
    const plans = this.listTradingPlans();
    const alerts = this.listTradeAlerts();
    const reviews = this.listTradeReviews();
    const reviewedPlanIds = new Set(reviews.flatMap((review) => (review.planId ? [review.planId] : [])));
    const pendingReviewPlans = plans.filter((plan) => plan.status === 'completed' && !reviewedPlanIds.has(plan.id));
    const pendingReviewEpisodes = this.episodes.listPendingReview();
    const openEpisodes = this.episodes.listEpisodes().filter((episode) => episode.status === 'open');
    const activePlans = plans.filter((plan) => plan.status === 'watching' || plan.status === 'holding');
    const triggeredAlerts = alerts.filter((alert) => alert.status === 'triggered');
    const totalPnlCents = reviews.reduce((total, review) => total + toScaledInteger(review.pnl, MONEY_SCALE), 0);
    const totalScore = reviews.reduce((total, review) => total + review.executionScore, 0);

    return {
      activePlanCount: activePlans.length,
      triggeredAlertCount: triggeredAlerts.length,
      pendingReviewCount: pendingReviewPlans.length + pendingReviewEpisodes.length,
      openEpisodeCount: openEpisodes.length,
      reviewedTradeCount: reviews.length,
      totalPnl: fromScaledInteger(totalPnlCents, MONEY_SCALE),
      averageExecutionScore: reviews.length === 0 ? null : totalScore / reviews.length,
      activePlans: activePlans.slice(0, 6),
      triggeredAlerts: triggeredAlerts.slice(0, 6),
      pendingReviewPlans: pendingReviewPlans.slice(0, 6),
      pendingReviewEpisodes: pendingReviewEpisodes.slice(0, 6),
      recentReviews: reviews.slice(0, 5),
      dueSipOccurrences: [],
      activeSipPlanCount: 0,
      dueSipOccurrenceCount: 0,
    };
  }

  private getTradingPlan(id: string): TradingPlan {
    const row = this.db.prepare('SELECT * FROM trading_plans WHERE id = ?').get(id) as unknown as TradingPlanRow | undefined;
    if (!row) throw new Error('交易计划不存在');
    return this.mapTradingPlan(row);
  }

  private getTradeAlert(id: string): TradeAlert {
    const row = this.db.prepare('SELECT * FROM alert_rules WHERE id = ?').get(id) as unknown as TradeAlertRow | undefined;
    if (!row) throw new Error('提醒不存在');
    return this.mapTradeAlert(row);
  }

  private getTradeReview(id: string): TradeReview {
    const row = this.db.prepare('SELECT * FROM trade_reviews WHERE id = ?').get(id) as unknown as TradeReviewRow | undefined;
    if (!row) throw new Error('复盘不存在');
    return this.mapTradeReview(row);
  }

  private insertPlanAlert(planId: string, role: Exclude<TradeAlertRole, 'custom'>, now: string): void {
    const plan = this.getTradingPlan(planId);
    let condition: TradeAlertCondition;
    let targetPrice: number;
    let title: string;

    if (role === 'entry') {
      condition = plan.direction === 'long' ? 'at_or_below' : 'at_or_above';
      targetPrice = plan.entryPrice;
      title = `计划入场 · ${plan.name}`;
    } else if (role === 'stop') {
      condition = plan.direction === 'long' ? 'at_or_below' : 'at_or_above';
      targetPrice = plan.stopPrice;
      title = `风险失效 · ${plan.name}`;
    } else {
      if (plan.targetPrice === null) return;
      condition = plan.direction === 'long' ? 'at_or_above' : 'at_or_below';
      targetPrice = plan.targetPrice;
      title = `计划目标 · ${plan.name}`;
    }

    this.db
      .prepare(
        `
        INSERT INTO alert_rules (
          id, plan_id, symbol, title, condition, role, target_price_micros,
          last_price_micros, status, triggered_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'active', NULL, ?, ?)
      `,
      )
      .run(randomUUID(), planId, plan.symbol, title, condition, role, toScaledInteger(targetPrice, PRICE_SCALE), now, now);
  }

  private assertPlanPrices(input: CreateTradingPlanInput): void {
    if (input.entryPrice <= 0 || input.stopPrice <= 0 || input.riskAmount < 0)
      throw new Error('价格必须大于 0，风险金额不能为负数');
    if (input.direction === 'long' && input.stopPrice >= input.entryPrice) throw new Error('做多计划的止损价必须低于入场价');
    if (input.direction === 'short' && input.stopPrice <= input.entryPrice) throw new Error('做空计划的止损价必须高于入场价');
    if (input.targetPrice !== null) {
      if (input.direction === 'long' && input.targetPrice <= input.entryPrice) throw new Error('做多计划的目标价必须高于入场价');
      if (input.direction === 'short' && input.targetPrice >= input.entryPrice) throw new Error('做空计划的目标价必须低于入场价');
    }
  }

  private mapTradingPlan(row: TradingPlanRow): TradingPlan {
    return {
      id: row.id,
      symbol: row.symbol,
      name: row.name,
      direction: row.direction,
      thesis: row.thesis,
      entryPrice: fromScaledInteger(row.entry_price_micros, PRICE_SCALE),
      stopPrice: fromScaledInteger(row.stop_price_micros, PRICE_SCALE),
      targetPrice: row.target_price_micros === null ? null : fromScaledInteger(row.target_price_micros, PRICE_SCALE),
      riskAmount: fromScaledInteger(row.risk_amount_cents, MONEY_SCALE),
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapTradeAlert(row: TradeAlertRow): TradeAlert {
    return {
      id: row.id,
      planId: row.plan_id,
      symbol: row.symbol,
      title: row.title,
      condition: row.condition,
      role: row.role,
      targetPrice: fromScaledInteger(row.target_price_micros, PRICE_SCALE),
      lastPrice: row.last_price_micros === null ? null : fromScaledInteger(row.last_price_micros, PRICE_SCALE),
      status: row.status,
      triggeredAt: row.triggered_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapTradeReview(row: TradeReviewRow): TradeReview {
    return {
      id: row.id,
      planId: row.plan_id,
      episodeId: row.episode_id,
      symbol: row.symbol,
      title: row.title,
      direction: row.direction,
      planned: row.planned === 1,
      entryPrice: fromScaledInteger(row.entry_price_micros, PRICE_SCALE),
      exitPrice: fromScaledInteger(row.exit_price_micros, PRICE_SCALE),
      quantity: fromScaledInteger(row.quantity_micros, QUANTITY_SCALE),
      fees: fromScaledInteger(row.fees_cents, MONEY_SCALE),
      pnl: fromScaledInteger(row.pnl_cents, MONEY_SCALE),
      executionScore: row.execution_score,
      summary: row.summary,
      lesson: row.lesson,
      createdAt: row.created_at,
    };
  }

  private applyMigrations(): void {
    const appliedRows = this.db.prepare('SELECT version FROM schema_migrations').all() as unknown as VersionRow[];
    const applied = new Set(appliedRows.map((row) => row.version));
    const insertMigration = this.db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)');

    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;

      this.db.exec('BEGIN IMMEDIATE');
      try {
        this.db.exec(migration.sql);
        insertMigration.run(migration.version, migration.name, new Date().toISOString());
        this.db.exec('COMMIT');
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    }
  }
}
