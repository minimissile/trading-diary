import type { DatabaseSync } from 'node:sqlite';
import type { EastMoneyFundBasicInfo, FundProfileRecord } from '../../shared/market/fund-profile';
import type { InstrumentKind } from '../../shared/market/types';
import { normalizeSymbol as normalizeMarketSymbol } from './eastmoney/symbols';

interface FundProfileRow {
  symbol: string;
  kind: InstrumentKind;
  profile_json: string;
  fetched_at: string;
}

function normalizeSymbol(symbol: string): string {
  const normalized = normalizeMarketSymbol(symbol);
  if (!normalized) throw new Error('标的代码不能为空');
  return normalized;
}

function mapRow(row: FundProfileRow): FundProfileRecord {
  return {
    symbol: row.symbol,
    kind: row.kind,
    profile: JSON.parse(row.profile_json) as EastMoneyFundBasicInfo,
    fetchedAt: row.fetched_at,
  };
}

export class FundProfileDatabase {
  constructor(private readonly db: DatabaseSync) {}

  get(symbol: string): FundProfileRecord | null {
    const row = this.db
      .prepare('SELECT * FROM fund_profiles WHERE symbol = ?')
      .get(normalizeSymbol(symbol)) as FundProfileRow | undefined;
    return row ? mapRow(row) : null;
  }

  list(symbols: readonly string[]): FundProfileRecord[] {
    if (symbols.length === 0) return [];
    const normalized = [...new Set(symbols.map((item) => normalizeSymbol(item)))];
    const placeholders = normalized.map(() => '?').join(', ');
    const rows = this.db
      .prepare(`SELECT * FROM fund_profiles WHERE symbol IN (${placeholders})`)
      .all(...normalized) as unknown as FundProfileRow[];
    return rows.map(mapRow);
  }

  upsert(symbol: string, kind: InstrumentKind, profile: EastMoneyFundBasicInfo): FundProfileRecord {
    const normalized = normalizeSymbol(symbol);
    const fetchedAt = new Date().toISOString();
    const profileJson = JSON.stringify(profile);

    this.db
      .prepare(
        `INSERT INTO fund_profiles (symbol, kind, profile_json, fetched_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(symbol) DO UPDATE SET
           kind = excluded.kind,
           profile_json = excluded.profile_json,
           fetched_at = excluded.fetched_at`,
      )
      .run(normalized, kind, profileJson, fetchedAt);

    return {
      symbol: normalized,
      kind,
      profile,
      fetchedAt,
    };
  }

  delete(symbol: string): void {
    this.db.prepare('DELETE FROM fund_profiles WHERE symbol = ?').run(normalizeSymbol(symbol));
  }
}
