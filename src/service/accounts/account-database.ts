import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { resolveAccountName } from '../../shared/accounts/account-display';
import {
  DEFAULT_FEE_PROFILE_ID,
  FEE_PROFILE_FUND_DEFAULT,
  STAMP_DUTY_RATE_PPM,
  TRANSFER_FEE_RATE_PPM,
} from '../../shared/accounts/fee-presets';
import { commissionWanToPpm, formatCommissionWan } from '../../shared/accounts/fee-utils';
import type {
  AccountBroker,
  AccountCustomFeeInput,
  AccountKind,
  CreateTradingAccountInput,
  FeeProfile,
  FeeProfileRates,
  TradingAccount,
  UpdateTradingAccountInput,
} from '../../shared/accounts/types';

const MONEY_SCALE = 100;

function toCents(value: number): number {
  return Math.round(value * MONEY_SCALE);
}

function fromCents(value: number): number {
  return value / MONEY_SCALE;
}

interface AccountRow {
  id: string;
  name: string;
  broker: AccountBroker;
  account_kind: AccountKind;
  currency: string;
  market_scope_json: string;
  fee_profile_id: string | null;
  initial_balance_cents: number;
  is_default: number;
  is_archived: number;
  note: string;
  created_at: string;
  updated_at: string;
}

interface FeeProfileRow {
  id: string;
  name: string;
  commission_rate_ppm: number;
  commission_min_cents: number;
  etf_commission_rate_ppm: number | null;
  etf_commission_min_cents: number | null;
  stamp_duty_rate_ppm: number;
  transfer_fee_rate_ppm: number;
  transfer_fee_min_cents: number;
  other_fee_cents: number;
  slippage_bps: number;
  is_builtin: number;
  created_at: string;
  updated_at: string;
}

interface LedgerStatsRow {
  ledger_count: number;
  total_fees_cents: number;
  total_turnover_cents: number;
  position_count: number;
}

/**
 * 账户与费率配置的数据访问层。
 */
export class AccountDatabase {
  constructor(private readonly db: DatabaseSync) {}

  /** 确保存在默认账户并绑定标准费率。 */
  ensureDefaults(defaultAccountId: string): void {
    const now = new Date().toISOString();
    const existing = this.db
      .prepare('SELECT id FROM portfolio_accounts WHERE id = ?')
      .get(defaultAccountId) as { id: string } | undefined;

    if (!existing) {
      this.db
        .prepare(
          `INSERT INTO portfolio_accounts (
            id, name, currency, is_default, broker, account_kind, market_scope_json,
            fee_profile_id, initial_balance_cents, is_archived, note, created_at, updated_at
          ) VALUES (?, ?, 'CNY', 1, 'custom', 'securities', '["CN_A"]', ?, 0, 0, '', ?, ?)`,
        )
        .run(defaultAccountId, '默认账户', DEFAULT_FEE_PROFILE_ID, now, now);
      return;
    }

    this.db
      .prepare(
        `UPDATE portfolio_accounts
         SET fee_profile_id = COALESCE(fee_profile_id, ?), updated_at = ?
         WHERE id = ?`,
      )
      .run(DEFAULT_FEE_PROFILE_ID, now, defaultAccountId);
  }

  listAccounts(includeArchived = false): TradingAccount[] {
    const sql = includeArchived
      ? 'SELECT * FROM portfolio_accounts ORDER BY is_default DESC, is_archived ASC, name ASC'
      : 'SELECT * FROM portfolio_accounts WHERE is_archived = 0 ORDER BY is_default DESC, name ASC';
    const rows = this.db.prepare(sql).all() as unknown as AccountRow[];
    return rows.map((row) => this.mapAccount(row));
  }

  getAccount(id: string): TradingAccount {
    const row = this.db.prepare('SELECT * FROM portfolio_accounts WHERE id = ?').get(id) as unknown as
      | AccountRow
      | undefined;
    if (!row) throw new Error('账户不存在');
    return this.mapAccount(row);
  }

  getDefaultAccount(): TradingAccount {
    const row = this.db
      .prepare('SELECT * FROM portfolio_accounts WHERE is_default = 1 AND is_archived = 0 LIMIT 1')
      .get() as unknown as AccountRow | undefined;
    if (!row) throw new Error('未找到默认账户');
    return this.mapAccount(row);
  }

  createAccount(input: CreateTradingAccountInput): TradingAccount {
    const id = randomUUID();
    const now = new Date().toISOString();
    const broker = input.broker ?? 'custom';
    const accountKind = input.accountKind ?? 'securities';
    const storedName = resolveAccountName(broker, input.alias ?? input.name);
    const feeProfileId = this.resolveFeeProfileIdForCreate(input, accountKind, storedName);
    this.assertFeeProfileExists(feeProfileId);

    if (input.isDefault) {
      this.db.prepare('UPDATE portfolio_accounts SET is_default = 0, updated_at = ?').run(now);
    }

    this.db
      .prepare(
        `INSERT INTO portfolio_accounts (
          id, name, currency, is_default, broker, account_kind, market_scope_json,
          fee_profile_id, initial_balance_cents, is_archived, note, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '', ?, ?)`,
      )
      .run(
        id,
        storedName,
        input.currency ?? 'CNY',
        input.isDefault ? 1 : 0,
        broker,
        accountKind,
        JSON.stringify(input.marketScope ?? ['CN_A']),
        feeProfileId,
        0,
        now,
        now,
      );

    if (!this.hasDefaultAccount()) {
      this.db.prepare('UPDATE portfolio_accounts SET is_default = 1, updated_at = ? WHERE id = ?').run(now, id);
    }

    return this.getAccount(id);
  }

  updateAccount(id: string, input: UpdateTradingAccountInput): TradingAccount {
    const current = this.getAccount(id);
    const now = new Date().toISOString();
    const broker = input.broker ?? current.broker;
    const accountKind = input.accountKind ?? current.accountKind;
    const storedName =
      input.alias !== undefined || input.name !== undefined
        ? resolveAccountName(broker, input.alias ?? input.name)
        : current.name;
    let feeProfileId = input.feeProfileId ?? current.feeProfileId;

    if (input.customFee) {
      feeProfileId = this.syncCustomFeeProfile(current, storedName, accountKind, input.customFee);
    } else if (input.feeProfileId) {
      this.assertFeeProfileExists(input.feeProfileId);
    }

    this.db
      .prepare(
        `UPDATE portfolio_accounts SET
          name = ?, broker = ?, account_kind = ?, fee_profile_id = ?,
          updated_at = ?
         WHERE id = ?`,
      )
      .run(storedName, broker, accountKind, feeProfileId, now, id);

    return this.getAccount(id);
  }

  setDefaultAccount(id: string): TradingAccount {
    const account = this.getAccount(id);
    if (account.isArchived) throw new Error('已归档账户不能设为默认');
    const now = new Date().toISOString();
    this.db.prepare('UPDATE portfolio_accounts SET is_default = 0, updated_at = ?').run(now);
    this.db.prepare('UPDATE portfolio_accounts SET is_default = 1, updated_at = ? WHERE id = ?').run(now, id);
    return this.getAccount(id);
  }

  archiveAccount(id: string): TradingAccount {
    const account = this.getAccount(id);
    if (account.isDefault) throw new Error('默认账户不能归档，请先指定其他默认账户');
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE portfolio_accounts SET is_archived = 1, is_default = 0, updated_at = ? WHERE id = ?')
      .run(now, id);
    if (!this.hasDefaultAccount()) {
      const fallback = this.db
        .prepare('SELECT id FROM portfolio_accounts WHERE is_archived = 0 ORDER BY created_at ASC LIMIT 1')
        .get() as { id: string } | undefined;
      if (fallback) {
        this.db.prepare('UPDATE portfolio_accounts SET is_default = 1, updated_at = ? WHERE id = ?').run(now, fallback.id);
      }
    }
    return this.getAccount(id);
  }

  listFeeProfiles(): FeeProfile[] {
    const rows = this.db
      .prepare('SELECT * FROM fee_profiles ORDER BY is_builtin DESC, name ASC')
      .all() as unknown as FeeProfileRow[];
    return rows.map((row) => this.mapFeeProfile(row));
  }

  getFeeProfile(id: string): FeeProfile {
    const row = this.db.prepare('SELECT * FROM fee_profiles WHERE id = ?').get(id) as unknown as
      | FeeProfileRow
      | undefined;
    if (!row) throw new Error('费率模板不存在');
    return this.mapFeeProfile(row);
  }

  getFeeProfileRates(id: string): FeeProfileRates {
    return this.mapFeeProfileRates(this.getFeeProfile(id));
  }

  createCustomFeeProfile(
    accountName: string,
    accountKind: AccountKind,
    input: AccountCustomFeeInput,
  ): FeeProfile {
    const id = randomUUID();
    const now = new Date().toISOString();
    const rates = this.customFeeToRates(accountKind, input);
    const name = this.buildCustomFeeName(accountName, accountKind, input);
    this.db
      .prepare(
        `INSERT INTO fee_profiles (
          id, name, commission_rate_ppm, commission_min_cents,
          etf_commission_rate_ppm, etf_commission_min_cents,
          stamp_duty_rate_ppm, transfer_fee_rate_ppm, transfer_fee_min_cents, other_fee_cents, slippage_bps,
          is_builtin, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
      )
      .run(
        id,
        name,
        rates.commissionRatePpm,
        rates.commissionMinCents,
        rates.etfCommissionRatePpm,
        rates.etfCommissionMinCents,
        rates.stampDutyRatePpm,
        rates.transferFeeRatePpm,
        rates.transferFeeMinCents,
        rates.otherFeeCents,
        now,
        now,
      );
    return this.getFeeProfile(id);
  }

  updateCustomFeeProfile(
    id: string,
    accountName: string,
    accountKind: AccountKind,
    input: AccountCustomFeeInput,
  ): FeeProfile {
    const profile = this.getFeeProfile(id);
    if (profile.isBuiltin) throw new Error('内置费率不可修改');
    const now = new Date().toISOString();
    const rates = this.customFeeToRates(accountKind, input);
    const name = this.buildCustomFeeName(accountName, accountKind, input);
    this.db
      .prepare(
        `UPDATE fee_profiles SET
          name = ?, commission_rate_ppm = ?, commission_min_cents = ?,
          etf_commission_rate_ppm = ?, etf_commission_min_cents = ?,
          stamp_duty_rate_ppm = ?, transfer_fee_rate_ppm = ?, transfer_fee_min_cents = ?,
          other_fee_cents = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        name,
        rates.commissionRatePpm,
        rates.commissionMinCents,
        rates.etfCommissionRatePpm,
        rates.etfCommissionMinCents,
        rates.stampDutyRatePpm,
        rates.transferFeeRatePpm,
        rates.transferFeeMinCents,
        rates.otherFeeCents,
        now,
        id,
      );
    return this.getFeeProfile(id);
  }

  getAccountLedgerStats(accountId: string): {
    ledgerCount: number;
    totalFees: number;
    totalTurnover: number;
    positionCount: number;
  } {
    const stats = this.db
      .prepare(
        `SELECT
          COUNT(*) AS ledger_count,
          COALESCE(SUM(fees_cents), 0) AS total_fees_cents,
          COALESCE(SUM(ABS(quantity_micros) * price_micros / 1000000), 0) AS total_turnover_cents,
          COUNT(DISTINCT symbol) AS position_count
         FROM portfolio_ledger
         WHERE account_id = ?`,
      )
      .get(accountId) as unknown as LedgerStatsRow;

    return {
      ledgerCount: Number(stats.ledger_count ?? 0),
      totalFees: fromCents(Number(stats.total_fees_cents ?? 0)),
      totalTurnover: fromCents(Number(stats.total_turnover_cents ?? 0)),
      positionCount: Number(stats.position_count ?? 0),
    };
  }

  private hasDefaultAccount(): boolean {
    const row = this.db
      .prepare('SELECT id FROM portfolio_accounts WHERE is_default = 1 AND is_archived = 0 LIMIT 1')
      .get() as { id: string } | undefined;
    return Boolean(row);
  }

  private assertFeeProfileExists(id: string): void {
    const row = this.db.prepare('SELECT id FROM fee_profiles WHERE id = ?').get(id) as { id: string } | undefined;
    if (!row) throw new Error('费率模板不存在');
  }

  private mapAccount(row: AccountRow): TradingAccount {
    let marketScope: string[] = ['CN_A'];
    try {
      const parsed = JSON.parse(row.market_scope_json) as unknown;
      if (Array.isArray(parsed)) marketScope = parsed.filter((item): item is string => typeof item === 'string');
    } catch {
      // 保留默认市场范围
    }

    return {
      id: row.id,
      name: row.name,
      broker: row.broker,
      accountKind: row.account_kind,
      currency: row.currency,
      marketScope,
      feeProfileId: row.fee_profile_id,
      initialBalance: fromCents(row.initial_balance_cents),
      isDefault: row.is_default === 1,
      isArchived: row.is_archived === 1,
      note: row.note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapFeeProfile(row: FeeProfileRow): FeeProfile {
    return {
      id: row.id,
      name: row.name,
      commissionRatePpm: row.commission_rate_ppm,
      commissionMinCents: row.commission_min_cents,
      etfCommissionRatePpm: row.etf_commission_rate_ppm ?? null,
      etfCommissionMinCents: row.etf_commission_min_cents ?? null,
      stampDutyRatePpm: row.stamp_duty_rate_ppm,
      transferFeeRatePpm: row.transfer_fee_rate_ppm,
      transferFeeMinCents: row.transfer_fee_min_cents,
      otherFeeCents: row.other_fee_cents,
      slippageBps: row.slippage_bps,
      isBuiltin: row.is_builtin === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapFeeProfileRates(profile: FeeProfile): FeeProfileRates {
    return {
      commissionRatePpm: profile.commissionRatePpm,
      commissionMinCents: profile.commissionMinCents,
      etfCommissionRatePpm: profile.etfCommissionRatePpm,
      etfCommissionMinCents: profile.etfCommissionMinCents,
      stampDutyRatePpm: profile.stampDutyRatePpm,
      transferFeeRatePpm: profile.transferFeeRatePpm,
      transferFeeMinCents: profile.transferFeeMinCents,
      otherFeeCents: profile.otherFeeCents,
    };
  }

  private resolveFeeProfileIdForCreate(
    input: CreateTradingAccountInput,
    accountKind: AccountKind,
    storedName: string,
  ): string {
    if (input.customFee) {
      return this.createCustomFeeProfile(storedName, accountKind, input.customFee).id;
    }
    if (accountKind === 'fund') return FEE_PROFILE_FUND_DEFAULT.id;
    return input.feeProfileId ?? DEFAULT_FEE_PROFILE_ID;
  }

  private syncCustomFeeProfile(
    current: TradingAccount,
    accountName: string,
    accountKind: AccountKind,
    input: AccountCustomFeeInput,
  ): string {
    if (!current.feeProfileId) {
      return this.createCustomFeeProfile(accountName, accountKind, input).id;
    }
    const profile = this.getFeeProfile(current.feeProfileId);
    if (profile.isBuiltin) {
      return this.createCustomFeeProfile(accountName, accountKind, input).id;
    }
    this.updateCustomFeeProfile(current.feeProfileId, accountName, accountKind, input);
    return current.feeProfileId;
  }

  private customFeeToRates(accountKind: AccountKind, input: AccountCustomFeeInput): FeeProfileRates {
    const commissionRatePpm = commissionWanToPpm(input.commissionWan);
    const commissionMinCents =
      accountKind === 'fund' || input.noCommissionMin ? 0 : toCents(input.commissionMinYuan ?? 5);
    const etfRates = this.resolveEtfRates(accountKind, input);
    if (accountKind === 'fund') {
      return {
        commissionRatePpm,
        commissionMinCents: 0,
        etfCommissionRatePpm: null,
        etfCommissionMinCents: null,
        stampDutyRatePpm: 0,
        transferFeeRatePpm: 0,
        transferFeeMinCents: 0,
        otherFeeCents: 0,
      };
    }
    return {
      commissionRatePpm,
      commissionMinCents,
      ...etfRates,
      stampDutyRatePpm: STAMP_DUTY_RATE_PPM,
      transferFeeRatePpm: TRANSFER_FEE_RATE_PPM,
      transferFeeMinCents: 0,
      otherFeeCents: 0,
    };
  }

  private resolveEtfRates(
    accountKind: AccountKind,
    input: AccountCustomFeeInput,
  ): Pick<FeeProfileRates, 'etfCommissionRatePpm' | 'etfCommissionMinCents'> {
    if (accountKind !== 'securities') {
      return { etfCommissionRatePpm: null, etfCommissionMinCents: null };
    }
    return {
      etfCommissionRatePpm: commissionWanToPpm(input.etfCommissionWan ?? input.commissionWan),
      etfCommissionMinCents: input.etfNoCommissionMin ? 0 : toCents(input.etfCommissionMinYuan ?? 5),
    };
  }

  private buildCustomFeeName(
    accountName: string,
    accountKind: AccountKind,
    input: AccountCustomFeeInput,
  ): string {
    const prefix = accountKind === 'fund' ? '基金' : '股票';
    const wan = formatCommissionWan(commissionWanToPpm(input.commissionWan));
    const min =
      accountKind === 'fund' || input.noCommissionMin
        ? '无最低'
        : `最低${input.commissionMinYuan ?? 5}元`;
    if (accountKind === 'securities') {
      const etfWan = formatCommissionWan(commissionWanToPpm(input.etfCommissionWan ?? input.commissionWan));
      const etfMin = input.etfNoCommissionMin ? '无最低' : `最低${input.etfCommissionMinYuan ?? 5}元`;
      return `${accountName} · 股票${wan} · ${min} · ETF${etfWan} · ${etfMin}`;
    }
    return `${accountName} · ${prefix}${wan} · ${min}`;
  }
}
