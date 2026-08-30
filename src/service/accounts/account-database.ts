import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { resolveAccountName } from '../../shared/accounts/account-display';
import { resolveAccountMarketSettings } from '../../shared/accounts/market-defaults';
import { normalizeMarketScope } from '../../shared/market/venues';
import {
  DEFAULT_FEE_PROFILE_ID,
  FEE_PROFILE_FUND_DEFAULT,
  STAMP_DUTY_RATE_PPM,
  TRANSFER_FEE_RATE_PPM,
} from '../../shared/accounts/fee-presets';
import {
  formatCommissionWan,
  roundCommissionWan,
} from '../../shared/accounts/fee-utils';
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
  commission_wan: number | null;
  commission_min_cents: number;
  etf_commission_rate_ppm: number | null;
  etf_commission_wan: number | null;
  etf_commission_min_cents: number | null;
  etf_sh_commission_rate_ppm: number | null;
  etf_sh_commission_wan: number | null;
  etf_sh_commission_min_cents: number | null;
  etf_sz_commission_rate_ppm: number | null;
  etf_sz_commission_wan: number | null;
  etf_sz_commission_min_cents: number | null;
  hk_commission_wan: number | null;
  hk_commission_min_cents: number | null;
  us_commission_wan: number | null;
  us_commission_min_cents: number | null;
  us_commission_per_share: number | null;
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
    const marketSettings = resolveAccountMarketSettings({
      broker,
      accountKind,
      marketScope: input.marketScope,
      currency: input.currency,
    });
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
        marketSettings.currency,
        input.isDefault ? 1 : 0,
        broker,
        accountKind,
        JSON.stringify(marketSettings.marketScope),
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
    const marketSettings = resolveAccountMarketSettings({
      broker,
      accountKind,
      marketScope: input.marketScope ?? current.marketScope,
      currency: input.currency ?? current.currency,
    });
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
          name = ?, broker = ?, account_kind = ?, currency = ?, market_scope_json = ?,
          fee_profile_id = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        storedName,
        broker,
        accountKind,
        marketSettings.currency,
        JSON.stringify(marketSettings.marketScope),
        feeProfileId,
        now,
        id,
      );

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

  /**
   * 永久删除已归档账户及其关联流水、分红与交易回合。
   * @param id 账户 ID
   * @throws 账户未归档、仍为默认账户，或删除过程中违反外键约束
   */
  deleteAccount(id: string): void {
    const account = this.getAccount(id);
    if (!account.isArchived) throw new Error('仅已归档账户可删除');
    if (account.isDefault) throw new Error('默认账户不能删除');

    const feeProfileId = account.feeProfileId;

    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM executions WHERE account_id = ?').run(id);
      this.db.prepare('DELETE FROM trade_episodes WHERE account_id = ?').run(id);
      this.db.prepare('DELETE FROM portfolio_ledger WHERE account_id = ?').run(id);
      this.db.prepare('DELETE FROM portfolio_dividends WHERE account_id = ?').run(id);
      this.db.prepare('DELETE FROM portfolio_accounts WHERE id = ?').run(id);
      if (feeProfileId) this.deleteOrphanCustomFeeProfile(feeProfileId);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
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
          id, name, commission_rate_ppm, commission_wan, commission_min_cents,
          etf_commission_rate_ppm, etf_commission_wan, etf_commission_min_cents,
          etf_sh_commission_rate_ppm, etf_sh_commission_wan, etf_sh_commission_min_cents,
          etf_sz_commission_rate_ppm, etf_sz_commission_wan, etf_sz_commission_min_cents,
          hk_commission_wan, hk_commission_min_cents,
          us_commission_wan, us_commission_min_cents, us_commission_per_share,
          stamp_duty_rate_ppm, transfer_fee_rate_ppm, transfer_fee_min_cents, other_fee_cents, slippage_bps,
          is_builtin, created_at, updated_at
        ) VALUES (?, ?, 0, ?, ?, 0, ?, ?, 0, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
      )
      .run(
        id,
        name,
        rates.commissionWan,
        rates.commissionMinCents,
        rates.etfCommissionWan,
        rates.etfCommissionMinCents,
        rates.etfShCommissionWan,
        rates.etfShCommissionMinCents,
        rates.etfSzCommissionWan,
        rates.etfSzCommissionMinCents,
        rates.hkCommissionWan,
        rates.hkCommissionMinCents,
        rates.usCommissionWan,
        rates.usCommissionMinCents,
        rates.usCommissionPerShare,
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
          name = ?, commission_rate_ppm = 0, commission_wan = ?, commission_min_cents = ?,
          etf_commission_rate_ppm = 0, etf_commission_wan = ?, etf_commission_min_cents = ?,
          etf_sh_commission_rate_ppm = 0, etf_sh_commission_wan = ?, etf_sh_commission_min_cents = ?,
          etf_sz_commission_rate_ppm = 0, etf_sz_commission_wan = ?, etf_sz_commission_min_cents = ?,
          hk_commission_wan = ?, hk_commission_min_cents = ?,
          us_commission_wan = ?, us_commission_min_cents = ?, us_commission_per_share = ?,
          stamp_duty_rate_ppm = ?, transfer_fee_rate_ppm = ?, transfer_fee_min_cents = ?,
          other_fee_cents = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        name,
        rates.commissionWan,
        rates.commissionMinCents,
        rates.etfCommissionWan,
        rates.etfCommissionMinCents,
        rates.etfShCommissionWan,
        rates.etfShCommissionMinCents,
        rates.etfSzCommissionWan,
        rates.etfSzCommissionMinCents,
        rates.hkCommissionWan,
        rates.hkCommissionMinCents,
        rates.usCommissionWan,
        rates.usCommissionMinCents,
        rates.usCommissionPerShare,
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

  private deleteOrphanCustomFeeProfile(id: string): void {
    const row = this.db.prepare('SELECT is_builtin FROM fee_profiles WHERE id = ?').get(id) as
      | { is_builtin: number }
      | undefined;
    if (!row || row.is_builtin === 1) return;

    const stillUsed = this.db
      .prepare('SELECT id FROM portfolio_accounts WHERE fee_profile_id = ? LIMIT 1')
      .get(id) as { id: string } | undefined;
    if (stillUsed) return;

    this.db.prepare('DELETE FROM fee_profiles WHERE id = ?').run(id);
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
      if (Array.isArray(parsed)) marketScope = normalizeMarketScope(parsed.filter((item): item is string => typeof item === 'string'));
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

  private readCommissionWan(wan: number | null | undefined, legacyPpm: number | null | undefined): number {
    if (wan != null && !Number.isNaN(wan)) {
      return roundCommissionWan(wan);
    }
    if (legacyPpm == null) return 0;
    // v13 之前：ppm = wan × 100；v13 临时放大 10 倍后：ppm = wan × 1000
    return roundCommissionWan(legacyPpm >= 1000 ? legacyPpm / 1000 : legacyPpm / 100);
  }

  private mapFeeProfile(row: FeeProfileRow): FeeProfile {
    return {
      id: row.id,
      name: row.name,
      commissionWan: this.readCommissionWan(row.commission_wan, row.commission_rate_ppm),
      commissionMinCents: row.commission_min_cents,
      etfCommissionWan:
        row.etf_commission_wan != null || row.etf_commission_rate_ppm != null
          ? this.readCommissionWan(row.etf_commission_wan, row.etf_commission_rate_ppm)
          : null,
      etfCommissionMinCents: row.etf_commission_min_cents ?? null,
      etfShCommissionWan:
        row.etf_sh_commission_wan != null || row.etf_sh_commission_rate_ppm != null
          ? this.readCommissionWan(row.etf_sh_commission_wan, row.etf_sh_commission_rate_ppm)
          : null,
      etfShCommissionMinCents: row.etf_sh_commission_min_cents ?? null,
      etfSzCommissionWan:
        row.etf_sz_commission_wan != null || row.etf_sz_commission_rate_ppm != null
          ? this.readCommissionWan(row.etf_sz_commission_wan, row.etf_sz_commission_rate_ppm)
          : null,
      etfSzCommissionMinCents: row.etf_sz_commission_min_cents ?? null,
      hkCommissionWan:
        row.hk_commission_wan != null ? roundCommissionWan(row.hk_commission_wan) : null,
      hkCommissionMinCents: row.hk_commission_min_cents ?? null,
      usCommissionWan:
        row.us_commission_wan != null ? roundCommissionWan(row.us_commission_wan) : null,
      usCommissionMinCents: row.us_commission_min_cents ?? null,
      usCommissionPerShare: row.us_commission_per_share ?? null,
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
      commissionWan: profile.commissionWan,
      commissionMinCents: profile.commissionMinCents,
      etfCommissionWan: profile.etfCommissionWan,
      etfCommissionMinCents: profile.etfCommissionMinCents,
      etfShCommissionWan: profile.etfShCommissionWan,
      etfShCommissionMinCents: profile.etfShCommissionMinCents,
      etfSzCommissionWan: profile.etfSzCommissionWan,
      etfSzCommissionMinCents: profile.etfSzCommissionMinCents,
      hkCommissionWan: profile.hkCommissionWan,
      hkCommissionMinCents: profile.hkCommissionMinCents,
      usCommissionWan: profile.usCommissionWan,
      usCommissionMinCents: profile.usCommissionMinCents,
      usCommissionPerShare: profile.usCommissionPerShare,
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
    const commissionWan = roundCommissionWan(input.commissionWan);
    const commissionMinCents =
      accountKind === 'fund' || input.noCommissionMin ? 0 : toCents(input.commissionMinYuan ?? 5);
    const etfRates = this.resolveEtfProfileRates(accountKind, input);
    if (accountKind === 'fund') {
      return {
        commissionWan,
        commissionMinCents: 0,
        etfCommissionWan: null,
        etfCommissionMinCents: null,
        etfShCommissionWan: null,
        etfShCommissionMinCents: null,
        etfSzCommissionWan: null,
        etfSzCommissionMinCents: null,
        hkCommissionWan: null,
        hkCommissionMinCents: null,
        usCommissionWan: null,
        usCommissionMinCents: null,
        usCommissionPerShare: null,
        stampDutyRatePpm: 0,
        transferFeeRatePpm: 0,
        transferFeeMinCents: 0,
        otherFeeCents: 0,
      };
    }
    const offshoreRates = this.resolveOffshoreProfileRates(input);
    return {
      commissionWan,
      commissionMinCents,
      ...etfRates,
      ...offshoreRates,
      stampDutyRatePpm: STAMP_DUTY_RATE_PPM,
      transferFeeRatePpm: TRANSFER_FEE_RATE_PPM,
      transferFeeMinCents: 0,
      otherFeeCents: 0,
    };
  }

  private resolveOffshoreProfileRates(input: AccountCustomFeeInput): Pick<
    FeeProfileRates,
    | 'hkCommissionWan'
    | 'hkCommissionMinCents'
    | 'usCommissionWan'
    | 'usCommissionMinCents'
    | 'usCommissionPerShare'
  > {
    const empty = {
      hkCommissionWan: null,
      hkCommissionMinCents: null,
      usCommissionWan: null,
      usCommissionMinCents: null,
      usCommissionPerShare: null,
    } as const;

    if (
      input.hkCommissionWan == null &&
      input.hkCommissionMinYuan == null &&
      input.usCommissionWan == null &&
      input.usCommissionMinYuan == null &&
      input.usCommissionPerShare == null
    ) {
      return { ...empty };
    }

    const hk = this.etfMarketRatesFromInput(
      input.hkCommissionWan,
      input.hkCommissionMinYuan,
      input.hkNoCommissionMin,
      input.commissionWan,
    );
    const us = this.etfMarketRatesFromInput(
      input.usCommissionWan,
      input.usCommissionMinYuan,
      input.usNoCommissionMin,
      input.commissionWan,
    );
    const perShare =
      input.usCommissionPerShare != null && input.usCommissionPerShare > 0
        ? input.usCommissionPerShare
        : null;

    return {
      hkCommissionWan: input.hkCommissionWan != null ? hk.commissionWan : null,
      hkCommissionMinCents: input.hkCommissionWan != null || input.hkCommissionMinYuan != null
        ? hk.minCents
        : null,
      usCommissionWan: perShare == null && input.usCommissionWan != null ? us.commissionWan : null,
      usCommissionMinCents:
        input.usCommissionWan != null || input.usCommissionMinYuan != null || perShare != null
          ? us.minCents
          : null,
      usCommissionPerShare: perShare,
    };
  }

  private resolveEtfProfileRates(
    accountKind: AccountKind,
    input: AccountCustomFeeInput,
  ): Pick<
    FeeProfileRates,
    | 'etfCommissionWan'
    | 'etfCommissionMinCents'
    | 'etfShCommissionWan'
    | 'etfShCommissionMinCents'
    | 'etfSzCommissionWan'
    | 'etfSzCommissionMinCents'
  > {
    const empty = {
      etfCommissionWan: null,
      etfCommissionMinCents: null,
      etfShCommissionWan: null,
      etfShCommissionMinCents: null,
      etfSzCommissionWan: null,
      etfSzCommissionMinCents: null,
    } as const;
    if (accountKind !== 'securities') return { ...empty };

    const fallbackWan = input.etfCommissionWan ?? input.commissionWan;
    const sh = this.etfMarketRatesFromInput(
      input.etfShCommissionWan,
      input.etfShCommissionMinYuan,
      input.etfShNoCommissionMin,
      fallbackWan,
    );
    const sz = this.etfMarketRatesFromInput(
      input.etfSzCommissionWan,
      input.etfSzCommissionMinYuan,
      input.etfSzNoCommissionMin,
      fallbackWan,
    );

    return {
      etfCommissionWan: null,
      etfCommissionMinCents: null,
      etfShCommissionWan: sh.commissionWan,
      etfShCommissionMinCents: sh.minCents,
      etfSzCommissionWan: sz.commissionWan,
      etfSzCommissionMinCents: sz.minCents,
    };
  }

  private etfMarketRatesFromInput(
    wan: number | undefined,
    minYuan: number | undefined,
    noMin: boolean | undefined,
    fallbackWan: number,
  ): { commissionWan: number; minCents: number } {
    return {
      commissionWan: roundCommissionWan(wan ?? fallbackWan),
      minCents: noMin ? 0 : toCents(minYuan ?? 5),
    };
  }

  private buildCustomFeeName(
    accountName: string,
    accountKind: AccountKind,
    input: AccountCustomFeeInput,
  ): string {
    const prefix = accountKind === 'fund' ? '基金' : '股票';
    const wan = formatCommissionWan(input.commissionWan);
    const min =
      accountKind === 'fund' || input.noCommissionMin
        ? '无最低'
        : `最低${input.commissionMinYuan ?? 5}元`;
    if (accountKind === 'securities') {
      const shWan = formatCommissionWan(input.etfShCommissionWan ?? input.etfCommissionWan ?? input.commissionWan);
      const szWan = formatCommissionWan(input.etfSzCommissionWan ?? input.etfCommissionWan ?? input.commissionWan);
      const shMin = input.etfShNoCommissionMin ? '无最低' : `最低${input.etfShCommissionMinYuan ?? 5}元`;
      const szMin = input.etfSzNoCommissionMin ? '无最低' : `最低${input.etfSzCommissionMinYuan ?? 5}元`;
      if (shWan === szWan && shMin === szMin) {
        return `${accountName} · 股票${wan} · ${min} · ETF${shWan} · ${shMin}`;
      }
      return `${accountName} · 股票${wan} · ${min} · 沪ETF${shWan} · ${shMin} · 深ETF${szWan} · ${szMin}`;
    }
    return `${accountName} · ${prefix}${wan} · ${min}`;
  }
}
