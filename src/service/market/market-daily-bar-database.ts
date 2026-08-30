import type { DatabaseSync } from 'node:sqlite';
import type { InstrumentKind } from '../../shared/market/types';
import { normalizeSymbol as normalizeMarketSymbol } from './eastmoney/symbols';

const PRICE_SCALE = 10_000;

export interface MarketDailyBar {
  symbol: string;
  tradeDate: string;
  close: number;
  prevClose: number | null;
  kind: InstrumentKind;
  fetchedAt: string;
}

export interface MarketBarSyncMeta {
  symbol: string;
  kind: InstrumentKind;
  earliestDate: string;
  latestDate: string;
  lastSyncedAt: string;
  barCount: number;
}

interface MarketDailyBarRow {
  symbol: string;
  trade_date: string;
  close_micros: number;
  prev_close_micros: number | null;
  kind: InstrumentKind;
  fetched_at: string;
}

interface MarketBarSyncMetaRow {
  symbol: string;
  kind: InstrumentKind;
  earliest_date: string;
  latest_date: string;
  last_synced_at: string;
  bar_count: number;
}

function toScaledInteger(value: number): number {
  if (!Number.isFinite(value)) throw new Error('价格必须是有限数字');
  return Math.round(value * PRICE_SCALE);
}

function fromScaledInteger(value: number): number {
  return value / PRICE_SCALE;
}

function normalizeSymbol(symbol: string): string {
  const normalized = normalizeMarketSymbol(symbol);
  if (!normalized) throw new Error('标的代码不能为空');
  return normalized;
}

function mapBarRow(row: MarketDailyBarRow): MarketDailyBar {
  return {
    symbol: row.symbol,
    tradeDate: row.trade_date,
    close: fromScaledInteger(row.close_micros),
    prevClose: row.prev_close_micros === null ? null : fromScaledInteger(row.prev_close_micros),
    kind: row.kind,
    fetchedAt: row.fetched_at,
  };
}

function mapMetaRow(row: MarketBarSyncMetaRow): MarketBarSyncMeta {
  return {
    symbol: row.symbol,
    kind: row.kind,
    earliestDate: row.earliest_date,
    latestDate: row.latest_date,
    lastSyncedAt: row.last_synced_at,
    barCount: row.bar_count,
  };
}

export class MarketDailyBarDatabase {
  constructor(private readonly db: DatabaseSync) {}

  getSyncMeta(symbol: string): MarketBarSyncMeta | null {
    const row = this.db
      .prepare('SELECT * FROM market_bar_sync_meta WHERE symbol = ?')
      .get(normalizeSymbol(symbol)) as MarketBarSyncMetaRow | undefined;
    return row ? mapMetaRow(row) : null;
  }

  listBarsForSymbols(symbols: readonly string[], startDate: string, endDate: string): MarketDailyBar[] {
    if (symbols.length === 0) return [];
    const normalized = [...new Set(symbols.map((item) => normalizeSymbol(item)))];
    const placeholders = normalized.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `SELECT * FROM market_daily_bars
         WHERE symbol IN (${placeholders}) AND trade_date >= ? AND trade_date <= ?
         ORDER BY symbol ASC, trade_date ASC`,
      )
      .all(...normalized, startDate, endDate) as MarketDailyBarRow[];
    return rows.map(mapBarRow);
  }

  upsertBars(symbol: string, kind: InstrumentKind, bars: readonly Omit<MarketDailyBar, 'symbol' | 'kind'>[]): void {
    const normalized = normalizeSymbol(symbol);
    const fetchedAt = new Date().toISOString();
    const upsert = this.db.prepare(`
      INSERT INTO market_daily_bars (symbol, trade_date, close_micros, prev_close_micros, kind, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(symbol, trade_date) DO UPDATE SET
        close_micros = excluded.close_micros,
        prev_close_micros = excluded.prev_close_micros,
        kind = excluded.kind,
        fetched_at = excluded.fetched_at
    `);

    const tx = this.db.transaction((items: readonly Omit<MarketDailyBar, 'symbol' | 'kind'>[]) => {
      for (const bar of items) {
        upsert.run(
          normalized,
          bar.tradeDate,
          toScaledInteger(bar.close),
          bar.prevClose === null ? null : toScaledInteger(bar.prevClose),
          kind,
          bar.fetchedAt || fetchedAt,
        );
      }
    });

    tx(bars);
  }

  upsertSyncMeta(meta: MarketBarSyncMeta): void {
    this.db
      .prepare(
        `INSERT INTO market_bar_sync_meta (symbol, kind, earliest_date, latest_date, last_synced_at, bar_count)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(symbol) DO UPDATE SET
           kind = excluded.kind,
           earliest_date = excluded.earliest_date,
           latest_date = excluded.latest_date,
           last_synced_at = excluded.last_synced_at,
           bar_count = excluded.bar_count`,
      )
      .run(
        normalizeSymbol(meta.symbol),
        meta.kind,
        meta.earliestDate,
        meta.latestDate,
        meta.lastSyncedAt,
        meta.barCount,
      );
  }

  purgeBarsBefore(symbol: string, beforeDate: string): number {
    const result = this.db
      .prepare('DELETE FROM market_daily_bars WHERE symbol = ? AND trade_date < ?')
      .run(normalizeSymbol(symbol), beforeDate);
    return result.changes ?? 0;
  }

  countBars(symbol: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS count FROM market_daily_bars WHERE symbol = ?')
      .get(normalizeSymbol(symbol)) as { count: number };
    return row.count;
  }
}
