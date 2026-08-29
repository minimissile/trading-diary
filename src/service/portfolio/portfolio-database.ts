import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { InstrumentKind } from '../../shared/market/types';
import { isAllAccountsId } from '../../shared/accounts/constants';
import type {
  CreatePortfolioLedgerInput,
  DividendRecordSource,
  DividendRecordStatus,
  PortfolioDividendRecord,
  PortfolioLedgerEntry,
  PortfolioLedgerSide,
  PortfolioLedgerSource,
  UpdatePortfolioLedgerInput,
} from '../../shared/portfolio/types';
import { normalizeSymbol as normalizeMarketSymbol } from '../market/eastmoney/symbols';
import { ledgerQuantityDelta } from './ledger-service';

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
  const normalized = normalizeMarketSymbol(symbol);
  if (!normalized) throw new Error('标的代码不能为空');
  return normalized;
}

interface PortfolioLedgerRow {
  id: string;
  account_id: string;
  symbol: string;
  kind: InstrumentKind;
  side: PortfolioLedgerSide;
  quantity_micros: number;
  price_micros: number;
  fees_cents: number;
  trade_at: string;
  plan_id: string | null;
  note: string;
  source: PortfolioLedgerSource;
  sip_occurrence_id: string | null;
  created_at: string;
}

interface PortfolioDividendRow {
  id: string;
  account_id: string;
  symbol: string;
  kind: InstrumentKind;
  ex_dividend_date: string;
  record_date: string | null;
  pay_date: string | null;
  cash_per_share_micros: number;
  eligible_quantity_micros: number;
  cash_amount_cents: number;
  status: DividendRecordStatus;
  source: DividendRecordSource;
  external_event_key: string;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertPortfolioDividendInput {
  accountId: string;
  symbol: string;
  kind: InstrumentKind;
  exDividendDate: string;
  recordDate: string | null;
  payDate: string | null;
  cashPerShare: number;
  eligibleQuantity: number;
  cashAmount: number;
  status: DividendRecordStatus;
  source: DividendRecordSource;
  externalEventKey: string;
}

export class PortfolioDatabase {
  constructor(private readonly db: DatabaseSync) {}

  ensureDefaultAccount(): string {
    const existing = this.db
      .prepare('SELECT id FROM portfolio_accounts WHERE is_default = 1 LIMIT 1')
      .get() as { id: string } | undefined;
    if (existing) return existing.id;

    const id = 'default';
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO portfolio_accounts (id, name, currency, is_default, created_at, updated_at)
         VALUES (?, ?, 'CNY', 1, ?, ?)`,
      )
      .run(id, '默认账户', now, now);
    return id;
  }

  resolveAccountId(accountId?: string): string {
    if (accountId) return accountId;
    return this.ensureDefaultAccount();
  }

  listActiveAccountIds(): string[] {
    const rows = this.db
      .prepare('SELECT id FROM portfolio_accounts WHERE is_archived = 0 ORDER BY is_default DESC, name ASC')
      .all() as Array<{ id: string }>;
    return rows.map((row) => row.id);
  }

  listLedger(accountId?: string): PortfolioLedgerEntry[] {
    if (isAllAccountsId(accountId)) {
      return this.listAllLedger();
    }
    const resolved = this.resolveAccountId(accountId);
    const rows = this.db
      .prepare('SELECT * FROM portfolio_ledger WHERE account_id = ? ORDER BY trade_at ASC, created_at ASC')
      .all(resolved) as unknown as PortfolioLedgerRow[];
    return rows.map((row) => this.mapLedger(row));
  }

  listAllLedger(): PortfolioLedgerEntry[] {
    const accountIds = this.listActiveAccountIds();
    if (accountIds.length === 0) return [];
    const placeholders = accountIds.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `SELECT * FROM portfolio_ledger WHERE account_id IN (${placeholders}) ORDER BY trade_at ASC, created_at ASC`,
      )
      .all(...accountIds) as unknown as PortfolioLedgerRow[];
    return rows.map((row) => this.mapLedger(row));
  }

  listLedgerEntries(accountId?: string, symbol?: string): PortfolioLedgerEntry[] {
    const params: Array<string> = [];
    let sql = 'SELECT * FROM portfolio_ledger WHERE 1 = 1';

    if (accountId && !isAllAccountsId(accountId)) {
      sql += ' AND account_id = ?';
      params.push(this.resolveAccountId(accountId));
    } else if (isAllAccountsId(accountId)) {
      const accountIds = this.listActiveAccountIds();
      if (accountIds.length === 0) return [];
      sql += ` AND account_id IN (${accountIds.map(() => '?').join(', ')})`;
      params.push(...accountIds);
    }

    if (symbol) {
      sql += ' AND symbol = ?';
      params.push(normalizeSymbol(symbol));
    }

    sql += ' ORDER BY trade_at DESC, created_at DESC';
    const rows = this.db.prepare(sql).all(...params) as unknown as PortfolioLedgerRow[];
    return rows.map((row) => this.mapLedger(row));
  }

  /** 检测是否已有相同定投导入流水（同日、同标的、同份额与净值）。 */
  hasSimilarSipImport(
    accountId: string,
    symbol: string,
    tradeAt: string,
    quantity: number,
    nav: number,
  ): boolean {
    const resolved = this.resolveAccountId(accountId);
    const normalized = normalizeSymbol(symbol);
    const tradeDay = tradeAt.slice(0, 10);
    const entries = this.listLedger(resolved).filter(
      (entry) =>
        entry.symbol === normalized &&
        entry.source === 'sip' &&
        entry.side === 'buy' &&
        entry.tradeAt.slice(0, 10) === tradeDay,
    );
    return entries.some(
      (entry) => Math.abs(entry.quantity - quantity) < 1e-6 && Math.abs(entry.price - nav) < 1e-6,
    );
  }

  listLedgerBySymbol(accountId: string, symbol: string): PortfolioLedgerEntry[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM portfolio_ledger WHERE account_id = ? AND symbol = ? ORDER BY trade_at ASC, created_at ASC`,
      )
      .all(accountId, normalizeSymbol(symbol)) as unknown as PortfolioLedgerRow[];
    return rows.map((row) => this.mapLedger(row));
  }

  addLedgerEntry(input: CreatePortfolioLedgerInput): PortfolioLedgerEntry {
    const accountId = this.resolveAccountId(input.accountId);
    const symbol = normalizeSymbol(input.symbol);
    const quantity = Math.abs(input.quantity);
    if (quantity <= 0) throw new Error('成交数量必须大于 0');
    if (input.price <= 0) throw new Error('成交价格必须大于 0');

    const quantityMicros =
      input.side === 'sell' ? -toScaledInteger(quantity, QUANTITY_SCALE) : toScaledInteger(quantity, QUANTITY_SCALE);

    if (input.side === 'sell') {
      const current = this.listLedger(accountId).filter((entry) => entry.symbol === symbol);
      const held = current.reduce((sum, entry) => sum + ledgerQuantityDelta(entry), 0);
      if (quantity > held + 1e-8) throw new Error('卖出数量不能超过当前持仓');
    }

    const kind = input.kind ?? 'stock';

    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO portfolio_ledger (
          id, account_id, symbol, kind, side, quantity_micros, price_micros, fees_cents,
          trade_at, plan_id, note, source, sip_occurrence_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        accountId,
        symbol,
        kind,
        input.side,
        quantityMicros,
        toScaledInteger(input.price, PRICE_SCALE),
        toScaledInteger(input.fees ?? 0, MONEY_SCALE),
        input.tradeAt,
        input.planId ?? null,
        (input.note ?? '').trim(),
        input.source ?? 'manual',
        input.sipOccurrenceId ?? null,
        now,
      );

    return this.getLedgerEntry(id);
  }

  updateLedgerEntry(id: string, input: UpdatePortfolioLedgerInput): PortfolioLedgerEntry {
    const existing = this.getLedgerEntry(id);
    const side = input.side ?? existing.side;
    const quantity = input.quantity !== undefined ? Math.abs(input.quantity) : existing.quantity;
    const price = input.price ?? existing.price;
    const fees = input.fees ?? existing.fees;
    const tradeAt = input.tradeAt ?? existing.tradeAt;
    const note = input.note !== undefined ? input.note.trim() : existing.note;

    if (quantity <= 0) throw new Error('成交数量必须大于 0');
    if (price <= 0) throw new Error('成交价格必须大于 0');

    if (side === 'sell') {
      const others = this.listLedger(existing.accountId).filter(
        (entry) => entry.symbol === existing.symbol && entry.id !== id,
      );
      const held = others.reduce((sum, entry) => sum + ledgerQuantityDelta(entry), 0);
      if (quantity > held + 1e-8) throw new Error('卖出数量不能超过当前持仓');
    }

    const quantityMicros =
      side === 'sell' ? -toScaledInteger(quantity, QUANTITY_SCALE) : toScaledInteger(quantity, QUANTITY_SCALE);

    this.db
      .prepare(
        `UPDATE portfolio_ledger SET
          side = ?, quantity_micros = ?, price_micros = ?, fees_cents = ?, trade_at = ?, note = ?
         WHERE id = ?`,
      )
      .run(
        side,
        quantityMicros,
        toScaledInteger(price, PRICE_SCALE),
        toScaledInteger(fees, MONEY_SCALE),
        tradeAt,
        note,
        id,
      );

    return this.getLedgerEntry(id);
  }

  deleteLedgerEntry(id: string): PortfolioLedgerEntry {
    const existing = this.getLedgerEntry(id);
    this.db.prepare('DELETE FROM portfolio_ledger WHERE id = ?').run(id);
    return existing;
  }

  deletePositionLedger(accountId: string | undefined, symbol: string): number {
    const normalized = normalizeSymbol(symbol);

    if (isAllAccountsId(accountId)) {
      const accountIds = this.listActiveAccountIds();
      if (accountIds.length === 0) return 0;
      const placeholders = accountIds.map(() => '?').join(', ');
      const result = this.db
        .prepare(`DELETE FROM portfolio_ledger WHERE account_id IN (${placeholders}) AND symbol = ?`)
        .run(...accountIds, normalized);
      return Number(result.changes ?? 0);
    }

    const resolved = this.resolveAccountId(accountId);
    const result = this.db
      .prepare('DELETE FROM portfolio_ledger WHERE account_id = ? AND symbol = ?')
      .run(resolved, normalized);
    return Number(result.changes ?? 0);
  }

  listDividends(accountId?: string, year?: number, statuses?: DividendRecordStatus[]): PortfolioDividendRecord[] {
    if (isAllAccountsId(accountId)) {
      return this.listAllDividends(year, statuses);
    }
    const resolved = this.resolveAccountId(accountId);
    const params: Array<string | number> = [resolved];
    let sql = 'SELECT * FROM portfolio_dividends WHERE account_id = ?';

    if (year !== undefined) {
      sql += ' AND ex_dividend_date >= ? AND ex_dividend_date < ?';
      params.push(`${year}-01-01`, `${year + 1}-01-01`);
    }

    if (statuses && statuses.length > 0) {
      sql += ` AND status IN (${statuses.map(() => '?').join(', ')})`;
      params.push(...statuses);
    }

    sql += ' ORDER BY ex_dividend_date DESC, symbol ASC';

    const rows = this.db.prepare(sql).all(...params) as unknown as PortfolioDividendRow[];
    return rows.map((row) => this.mapDividend(row));
  }

  listAllDividends(year?: number, statuses?: DividendRecordStatus[]): PortfolioDividendRecord[] {
    const accountIds = this.listActiveAccountIds();
    if (accountIds.length === 0) return [];

    const params: Array<string | number> = [...accountIds];
    let sql = `SELECT * FROM portfolio_dividends WHERE account_id IN (${accountIds.map(() => '?').join(', ')})`;

    if (year !== undefined) {
      sql += ' AND ex_dividend_date >= ? AND ex_dividend_date < ?';
      params.push(`${year}-01-01`, `${year + 1}-01-01`);
    }

    if (statuses && statuses.length > 0) {
      sql += ` AND status IN (${statuses.map(() => '?').join(', ')})`;
      params.push(...statuses);
    }

    sql += ' ORDER BY ex_dividend_date DESC, symbol ASC';
    const rows = this.db.prepare(sql).all(...params) as unknown as PortfolioDividendRow[];
    return rows.map((row) => this.mapDividend(row));
  }

  upsertDividend(input: UpsertPortfolioDividendInput): PortfolioDividendRecord {
    const now = new Date().toISOString();
    const symbol = normalizeSymbol(input.symbol);
    const existing = this.db
      .prepare(
        `SELECT id FROM portfolio_dividends
         WHERE account_id = ? AND symbol = ? AND ex_dividend_date = ? AND external_event_key = ?`,
      )
      .get(input.accountId, symbol, input.exDividendDate, input.externalEventKey) as { id: string } | undefined;

    if (existing) {
      this.db
        .prepare(
          `UPDATE portfolio_dividends SET
            kind = ?, record_date = ?, pay_date = ?, cash_per_share_micros = ?,
            eligible_quantity_micros = ?, cash_amount_cents = ?, status = ?, source = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          input.kind,
          input.recordDate,
          input.payDate,
          toScaledInteger(input.cashPerShare, PRICE_SCALE),
          toScaledInteger(input.eligibleQuantity, QUANTITY_SCALE),
          toScaledInteger(input.cashAmount, MONEY_SCALE),
          input.status,
          input.source,
          now,
          existing.id,
        );
      return this.getDividend(existing.id);
    }

    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO portfolio_dividends (
          id, account_id, symbol, kind, ex_dividend_date, record_date, pay_date,
          cash_per_share_micros, eligible_quantity_micros, cash_amount_cents,
          status, source, external_event_key, confirmed_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      )
      .run(
        id,
        input.accountId,
        symbol,
        input.kind,
        input.exDividendDate,
        input.recordDate,
        input.payDate,
        toScaledInteger(input.cashPerShare, PRICE_SCALE),
        toScaledInteger(input.eligibleQuantity, QUANTITY_SCALE),
        toScaledInteger(input.cashAmount, MONEY_SCALE),
        input.status,
        input.source,
        input.externalEventKey,
        now,
        now,
      );
    return this.getDividend(id);
  }

  setDividendStatus(id: string, status: DividendRecordStatus, cashAmountCents?: number): PortfolioDividendRecord {
    const now = new Date().toISOString();
    if (cashAmountCents !== undefined) {
      this.db
        .prepare(`UPDATE portfolio_dividends SET status = ?, cash_amount_cents = ?, confirmed_at = ?, updated_at = ? WHERE id = ?`)
        .run(status, cashAmountCents, status === 'confirmed' ? now : null, now, id);
    } else {
      this.db
        .prepare(`UPDATE portfolio_dividends SET status = ?, confirmed_at = ?, updated_at = ? WHERE id = ?`)
        .run(status, status === 'confirmed' ? now : null, now, id);
    }
    return this.getDividend(id);
  }

  autoConfirmPastDividends(accountId: string, cutoffDate: string): number {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `UPDATE portfolio_dividends SET status = 'confirmed', confirmed_at = ?, updated_at = ?
         WHERE account_id = ? AND status = 'estimated' AND ex_dividend_date <= ?`,
      )
      .run(now, now, accountId, cutoffDate);
    return Number(result.changes ?? 0);
  }

  private getLedgerEntry(id: string): PortfolioLedgerEntry {
    const row = this.db.prepare('SELECT * FROM portfolio_ledger WHERE id = ?').get(id) as unknown as
      | PortfolioLedgerRow
      | undefined;
    if (!row) throw new Error('持仓流水不存在');
    return this.mapLedger(row);
  }

  private getDividend(id: string): PortfolioDividendRecord {
    const row = this.db.prepare('SELECT * FROM portfolio_dividends WHERE id = ?').get(id) as unknown as
      | PortfolioDividendRow
      | undefined;
    if (!row) throw new Error('分红记录不存在');
    return this.mapDividend(row);
  }

  private mapLedger(row: PortfolioLedgerRow): PortfolioLedgerEntry {
    const quantityAbs = Math.abs(fromScaledInteger(row.quantity_micros, QUANTITY_SCALE));
    return {
      id: row.id,
      accountId: row.account_id,
      symbol: row.symbol,
      kind: row.kind,
      side: row.side,
      quantity: quantityAbs,
      price: fromScaledInteger(row.price_micros, PRICE_SCALE),
      fees: fromScaledInteger(row.fees_cents, MONEY_SCALE),
      tradeAt: row.trade_at,
      planId: row.plan_id,
      note: row.note,
      source: row.source,
      sipOccurrenceId: row.sip_occurrence_id ?? null,
      createdAt: row.created_at,
    };
  }

  private mapDividend(row: PortfolioDividendRow): PortfolioDividendRecord {
    return {
      id: row.id,
      accountId: row.account_id,
      symbol: row.symbol,
      name: row.symbol,
      kind: row.kind,
      exDividendDate: row.ex_dividend_date,
      recordDate: row.record_date,
      payDate: row.pay_date,
      cashPerShare: fromScaledInteger(row.cash_per_share_micros, PRICE_SCALE),
      eligibleQuantity: fromScaledInteger(row.eligible_quantity_micros, QUANTITY_SCALE),
      cashAmount: fromScaledInteger(row.cash_amount_cents, MONEY_SCALE),
      status: row.status,
      source: row.source,
    };
  }

  countLedgerEntries(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM portfolio_ledger').get() as { count: number };
    return row.count;
  }

  countDividends(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM portfolio_dividends').get() as { count: number };
    return row.count;
  }
}
