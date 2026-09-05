export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    sql: `
      CREATE TABLE assets (
        hash TEXT PRIMARY KEY,
        original_name TEXT NOT NULL,
        media_type TEXT NOT NULL,
        original_bytes INTEGER NOT NULL CHECK (original_bytes >= 0),
        preview_bytes INTEGER NOT NULL CHECK (preview_bytes >= 0),
        width INTEGER,
        height INTEGER,
        original_path TEXT NOT NULL UNIQUE,
        preview_path TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE provider_connections (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        display_name TEXT NOT NULL,
        config_json TEXT NOT NULL DEFAULT '{}',
        sync_cursor TEXT,
        last_synced_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        provider_connection_id TEXT,
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
        attempts INTEGER NOT NULL DEFAULT 0,
        idempotency_key TEXT UNIQUE,
        payload_json TEXT NOT NULL,
        error_json TEXT,
        run_after TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (provider_connection_id) REFERENCES provider_connections(id) ON DELETE CASCADE
      ) STRICT;

      CREATE INDEX jobs_ready_idx ON jobs(status, run_after);
    `,
  },
  {
    version: 2,
    name: 'trading_workspace',
    sql: `
      CREATE TABLE trading_plans (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        name TEXT NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('long', 'short')),
        thesis TEXT NOT NULL,
        entry_price_micros INTEGER NOT NULL CHECK (entry_price_micros > 0),
        stop_price_micros INTEGER NOT NULL CHECK (stop_price_micros > 0),
        target_price_micros INTEGER CHECK (target_price_micros > 0),
        risk_amount_cents INTEGER NOT NULL CHECK (risk_amount_cents >= 0),
        status TEXT NOT NULL CHECK (status IN ('draft', 'watching', 'holding', 'completed', 'cancelled')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE INDEX trading_plans_status_idx ON trading_plans(status, updated_at DESC);
      CREATE INDEX trading_plans_symbol_idx ON trading_plans(symbol, updated_at DESC);

      CREATE TABLE alert_rules (
        id TEXT PRIMARY KEY,
        plan_id TEXT,
        symbol TEXT NOT NULL,
        title TEXT NOT NULL,
        condition TEXT NOT NULL CHECK (condition IN ('at_or_above', 'at_or_below')),
        role TEXT NOT NULL CHECK (role IN ('entry', 'stop', 'target', 'custom')),
        target_price_micros INTEGER NOT NULL CHECK (target_price_micros > 0),
        last_price_micros INTEGER CHECK (last_price_micros > 0),
        status TEXT NOT NULL CHECK (status IN ('active', 'triggered', 'completed', 'disabled')),
        triggered_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (plan_id) REFERENCES trading_plans(id) ON DELETE CASCADE
      ) STRICT;

      CREATE INDEX alert_rules_status_idx ON alert_rules(status, updated_at DESC);
      CREATE INDEX alert_rules_symbol_idx ON alert_rules(symbol, status);

      CREATE TABLE trade_reviews (
        id TEXT PRIMARY KEY,
        plan_id TEXT UNIQUE,
        symbol TEXT NOT NULL,
        title TEXT NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('long', 'short')),
        planned INTEGER NOT NULL CHECK (planned IN (0, 1)),
        entry_price_micros INTEGER NOT NULL CHECK (entry_price_micros > 0),
        exit_price_micros INTEGER NOT NULL CHECK (exit_price_micros > 0),
        quantity_micros INTEGER NOT NULL CHECK (quantity_micros > 0),
        fees_cents INTEGER NOT NULL CHECK (fees_cents >= 0),
        pnl_cents INTEGER NOT NULL,
        execution_score INTEGER NOT NULL CHECK (execution_score BETWEEN 1 AND 5),
        summary TEXT NOT NULL,
        lesson TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (plan_id) REFERENCES trading_plans(id) ON DELETE SET NULL
      ) STRICT;

      CREATE INDEX trade_reviews_created_idx ON trade_reviews(created_at DESC);
      CREATE INDEX trade_reviews_symbol_idx ON trade_reviews(symbol, created_at DESC);
    `,
  },
  {
    version: 3,
    name: 'portfolio_holdings',
    sql: `
      CREATE TABLE portfolio_accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'CNY',
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE portfolio_ledger (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('stock','etf','lof','otc_fund')),
        side TEXT NOT NULL CHECK (side IN ('buy','sell','dividend_reinvest')),
        quantity_micros INTEGER NOT NULL,
        price_micros INTEGER NOT NULL CHECK (price_micros > 0),
        fees_cents INTEGER NOT NULL DEFAULT 0,
        trade_at TEXT NOT NULL,
        plan_id TEXT,
        note TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'manual',
        created_at TEXT NOT NULL,
        FOREIGN KEY (account_id) REFERENCES portfolio_accounts(id),
        FOREIGN KEY (plan_id) REFERENCES trading_plans(id) ON DELETE SET NULL
      ) STRICT;

      CREATE INDEX portfolio_ledger_symbol_idx ON portfolio_ledger(account_id, symbol, trade_at);

      CREATE TABLE portfolio_dividends (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('stock','etf','lof','otc_fund')),
        ex_dividend_date TEXT NOT NULL,
        record_date TEXT,
        pay_date TEXT,
        cash_per_share_micros INTEGER NOT NULL,
        eligible_quantity_micros INTEGER NOT NULL,
        cash_amount_cents INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('estimated','confirmed','rejected')),
        source TEXT NOT NULL CHECK (source IN ('api','manual')),
        external_event_key TEXT NOT NULL DEFAULT '',
        confirmed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (account_id, symbol, ex_dividend_date, external_event_key),
        FOREIGN KEY (account_id) REFERENCES portfolio_accounts(id)
      ) STRICT;

      CREATE INDEX portfolio_dividends_year_idx ON portfolio_dividends(account_id, ex_dividend_date);
    `,
  },
  {
    version: 4,
    name: 'account_management',
    sql: `
      CREATE TABLE fee_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        commission_rate_ppm INTEGER NOT NULL,
        commission_min_cents INTEGER NOT NULL,
        stamp_duty_rate_ppm INTEGER NOT NULL,
        transfer_fee_rate_ppm INTEGER NOT NULL,
        transfer_fee_min_cents INTEGER NOT NULL,
        other_fee_cents INTEGER NOT NULL DEFAULT 0,
        slippage_bps INTEGER NOT NULL DEFAULT 0,
        is_builtin INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      INSERT INTO fee_profiles (
        id, name, commission_rate_ppm, commission_min_cents, stamp_duty_rate_ppm,
        transfer_fee_rate_ppm, transfer_fee_min_cents, other_fee_cents, slippage_bps,
        is_builtin, created_at, updated_at
      ) VALUES
        ('fee-a-share-standard', 'A股标准（万2.5 / 最低5元）', 250, 500, 500, 10, 100, 0, 0, 1, datetime('now'), datetime('now')),
        ('fee-a-share-low', 'A股低佣（万1.5 / 最低5元）', 150, 500, 500, 10, 100, 0, 0, 1, datetime('now'), datetime('now')),
        ('fee-a-share-min', 'A股极低佣（万1 / 最低5元）', 100, 500, 500, 10, 100, 0, 0, 1, datetime('now'), datetime('now'));

      ALTER TABLE portfolio_accounts ADD COLUMN broker TEXT NOT NULL DEFAULT 'custom';
      ALTER TABLE portfolio_accounts ADD COLUMN account_kind TEXT NOT NULL DEFAULT 'securities';
      ALTER TABLE portfolio_accounts ADD COLUMN market_scope_json TEXT NOT NULL DEFAULT '["CN_A"]';
      ALTER TABLE portfolio_accounts ADD COLUMN fee_profile_id TEXT REFERENCES fee_profiles(id);
      ALTER TABLE portfolio_accounts ADD COLUMN initial_balance_cents INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE portfolio_accounts ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE portfolio_accounts ADD COLUMN note TEXT NOT NULL DEFAULT '';

      UPDATE portfolio_accounts
      SET fee_profile_id = 'fee-a-share-standard'
      WHERE fee_profile_id IS NULL;
    `,
  },
  {
    version: 5,
    name: 'fund_fee_preset',
    sql: `
      INSERT OR IGNORE INTO fee_profiles (
        id, name, commission_rate_ppm, commission_min_cents, stamp_duty_rate_ppm,
        transfer_fee_rate_ppm, transfer_fee_min_cents, other_fee_cents, slippage_bps,
        is_builtin, created_at, updated_at
      ) VALUES
        ('fee-fund-default', '基金默认（免五费）', 0, 0, 0, 0, 0, 0, 0, 1, datetime('now'), datetime('now'));
    `,
  },
  {
    version: 6,
    name: 'fee_transfer_rate_fix',
    sql: `
      UPDATE fee_profiles
      SET transfer_fee_min_cents = 0,
          stamp_duty_rate_ppm = 500,
          transfer_fee_rate_ppm = 10,
          updated_at = datetime('now')
      WHERE stamp_duty_rate_ppm > 0 OR transfer_fee_rate_ppm > 0;
    `,
  },
  {
    version: 7,
    name: 'fee_profile_etf_commission',
    sql: `
      ALTER TABLE fee_profiles ADD COLUMN etf_commission_rate_ppm INTEGER;
      ALTER TABLE fee_profiles ADD COLUMN etf_commission_min_cents INTEGER;
    `,
  },
  {
    version: 8,
    name: 'fee_profile_etf_backfill',
    sql: `
      UPDATE fee_profiles
      SET etf_commission_rate_ppm = commission_rate_ppm,
          etf_commission_min_cents = commission_min_cents,
          updated_at = datetime('now')
      WHERE etf_commission_rate_ppm IS NULL
        AND stamp_duty_rate_ppm > 0;
    `,
  },
  {
    version: 9,
    name: 'trade_episodes_executions',
    sql: `
      CREATE TABLE trade_episodes (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('long', 'short')),
        plan_id TEXT,
        status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
        title TEXT NOT NULL DEFAULT '',
        opened_at TEXT NOT NULL,
        closed_at TEXT,
        review_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (account_id) REFERENCES portfolio_accounts(id),
        FOREIGN KEY (plan_id) REFERENCES trading_plans(id) ON DELETE SET NULL,
        FOREIGN KEY (review_id) REFERENCES trade_reviews(id) ON DELETE SET NULL
      ) STRICT;

      CREATE INDEX trade_episodes_account_symbol_idx ON trade_episodes(account_id, symbol, status);

      CREATE TABLE executions (
        id TEXT PRIMARY KEY,
        episode_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
        quantity_micros INTEGER NOT NULL CHECK (quantity_micros > 0),
        price_micros INTEGER NOT NULL CHECK (price_micros > 0),
        fees_cents INTEGER NOT NULL DEFAULT 0,
        trade_at TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        idempotency_key TEXT UNIQUE,
        source TEXT NOT NULL DEFAULT 'manual',
        created_at TEXT NOT NULL,
        FOREIGN KEY (episode_id) REFERENCES trade_episodes(id) ON DELETE CASCADE,
        FOREIGN KEY (account_id) REFERENCES portfolio_accounts(id)
      ) STRICT;

      CREATE INDEX executions_episode_idx ON executions(episode_id, trade_at);

      ALTER TABLE trade_reviews ADD COLUMN episode_id TEXT REFERENCES trade_episodes(id) ON DELETE SET NULL;
      CREATE INDEX trade_reviews_episode_idx ON trade_reviews(episode_id);
    `,
  },
  {
    version: 10,
    name: 'playbook_rules_alert_events',
    sql: `
      CREATE TABLE playbook_rules (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN ('entry', 'position', 'stop', 'exit', 'market', 'emotion', 'process')),
        status TEXT NOT NULL CHECK (status IN ('active', 'archived')) DEFAULT 'active',
        symbol TEXT,
        check_timing TEXT NOT NULL CHECK (check_timing IN ('plan_activation', 'always')) DEFAULT 'plan_activation',
        source_review_id TEXT REFERENCES trade_reviews(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE INDEX playbook_rules_status_idx ON playbook_rules(status, updated_at DESC);
      CREATE INDEX playbook_rules_symbol_idx ON playbook_rules(symbol, status);

      CREATE TABLE alert_events (
        id TEXT PRIMARY KEY,
        alert_rule_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        title TEXT NOT NULL,
        condition TEXT NOT NULL CHECK (condition IN ('at_or_above', 'at_or_below')),
        target_price_micros INTEGER NOT NULL CHECK (target_price_micros > 0),
        trigger_price_micros INTEGER NOT NULL CHECK (trigger_price_micros > 0),
        triggered_at TEXT NOT NULL,
        user_action TEXT CHECK (user_action IN ('acknowledged', 'snoozed', 'dismissed', 'completed')),
        FOREIGN KEY (alert_rule_id) REFERENCES alert_rules(id) ON DELETE CASCADE
      ) STRICT;

      CREATE INDEX alert_events_triggered_idx ON alert_events(triggered_at DESC);
      CREATE INDEX alert_events_rule_idx ON alert_events(alert_rule_id, triggered_at DESC);
    `,
  },
  {
    version: 11,
    name: 'fund_sip',
    sql: `
      CREATE TABLE fund_sip_plans (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('stock','etf','lof','otc_fund')),
        amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
        frequency TEXT NOT NULL CHECK (frequency IN ('weekly','biweekly','monthly')),
        day_of_week INTEGER CHECK (day_of_week BETWEEN 1 AND 7),
        day_of_month INTEGER CHECK (day_of_month BETWEEN 1 AND 28),
        start_date TEXT NOT NULL,
        end_date TEXT,
        thesis TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('draft','active','paused','completed','cancelled')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (account_id) REFERENCES portfolio_accounts(id)
      ) STRICT;

      CREATE INDEX fund_sip_plans_status_idx ON fund_sip_plans(status, updated_at DESC);
      CREATE INDEX fund_sip_plans_symbol_idx ON fund_sip_plans(symbol, updated_at DESC);

      CREATE TABLE fund_sip_occurrences (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL,
        scheduled_date TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('scheduled','due','completed','skipped','missed')),
        amount_cents INTEGER,
        quantity_micros INTEGER,
        nav_micros INTEGER,
        fees_cents INTEGER,
        ledger_entry_id TEXT,
        skip_reason TEXT NOT NULL DEFAULT '',
        confirmed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (plan_id, scheduled_date),
        FOREIGN KEY (plan_id) REFERENCES fund_sip_plans(id) ON DELETE CASCADE
      ) STRICT;

      CREATE INDEX fund_sip_occurrences_due_idx ON fund_sip_occurrences(status, scheduled_date);
      CREATE INDEX fund_sip_occurrences_plan_idx ON fund_sip_occurrences(plan_id, scheduled_date DESC);

      ALTER TABLE portfolio_ledger ADD COLUMN sip_occurrence_id TEXT REFERENCES fund_sip_occurrences(id) ON DELETE SET NULL;
    `,
  },
  {
    version: 12,
    name: 'fee_profile_etf_market_commission',
    sql: `
      ALTER TABLE fee_profiles ADD COLUMN etf_sh_commission_rate_ppm INTEGER;
      ALTER TABLE fee_profiles ADD COLUMN etf_sh_commission_min_cents INTEGER;
      ALTER TABLE fee_profiles ADD COLUMN etf_sz_commission_rate_ppm INTEGER;
      ALTER TABLE fee_profiles ADD COLUMN etf_sz_commission_min_cents INTEGER;
    `,
  },
  {
    version: 13,
    name: 'fee_profile_commission_ppm_tenths',
    sql: `
      UPDATE fee_profiles SET commission_rate_ppm = commission_rate_ppm * 10;
      UPDATE fee_profiles SET etf_commission_rate_ppm = etf_commission_rate_ppm * 10
        WHERE etf_commission_rate_ppm IS NOT NULL;
      UPDATE fee_profiles SET etf_sh_commission_rate_ppm = etf_sh_commission_rate_ppm * 10
        WHERE etf_sh_commission_rate_ppm IS NOT NULL;
      UPDATE fee_profiles SET etf_sz_commission_rate_ppm = etf_sz_commission_rate_ppm * 10
        WHERE etf_sz_commission_rate_ppm IS NOT NULL;
    `,
  },
  {
    version: 14,
    name: 'fee_profile_commission_wan_real',
    sql: `
      ALTER TABLE fee_profiles ADD COLUMN commission_wan REAL;
      ALTER TABLE fee_profiles ADD COLUMN etf_commission_wan REAL;
      ALTER TABLE fee_profiles ADD COLUMN etf_sh_commission_wan REAL;
      ALTER TABLE fee_profiles ADD COLUMN etf_sz_commission_wan REAL;

      UPDATE fee_profiles SET commission_wan = ROUND(commission_rate_ppm / 1000.0, 4);
      UPDATE fee_profiles SET etf_commission_wan = ROUND(etf_commission_rate_ppm / 1000.0, 4)
        WHERE etf_commission_rate_ppm IS NOT NULL;
      UPDATE fee_profiles SET etf_sh_commission_wan = ROUND(etf_sh_commission_rate_ppm / 1000.0, 4)
        WHERE etf_sh_commission_rate_ppm IS NOT NULL;
      UPDATE fee_profiles SET etf_sz_commission_wan = ROUND(etf_sz_commission_rate_ppm / 1000.0, 4)
        WHERE etf_sz_commission_rate_ppm IS NOT NULL;
    `,
  },
  {
    version: 15,
    name: 'portfolio_preferences',
    sql: `
      CREATE TABLE portfolio_preferences (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
    `,
  },
  {
    version: 16,
    name: 'market_daily_bars',
    sql: `
      CREATE TABLE market_daily_bars (
        symbol TEXT NOT NULL,
        trade_date TEXT NOT NULL,
        close_micros INTEGER NOT NULL,
        prev_close_micros INTEGER,
        kind TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        PRIMARY KEY (symbol, trade_date)
      ) STRICT;

      CREATE INDEX market_daily_bars_date_idx ON market_daily_bars(trade_date);

      CREATE TABLE market_bar_sync_meta (
        symbol TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        earliest_date TEXT NOT NULL,
        latest_date TEXT NOT NULL,
        last_synced_at TEXT NOT NULL,
        bar_count INTEGER NOT NULL
      ) STRICT;
    `,
  },
  {
    version: 17,
    name: 'fund_sip_daily_frequency',
    sql: `
      CREATE TABLE fund_sip_plans__v17 (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('stock','etf','lof','otc_fund')),
        amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
        frequency TEXT NOT NULL CHECK (frequency IN ('daily','weekly','biweekly','monthly')),
        day_of_week INTEGER CHECK (day_of_week BETWEEN 1 AND 7),
        day_of_month INTEGER CHECK (day_of_month BETWEEN 1 AND 28),
        start_date TEXT NOT NULL,
        end_date TEXT,
        thesis TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('draft','active','paused','completed','cancelled')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (account_id) REFERENCES portfolio_accounts(id)
      ) STRICT;

      INSERT INTO fund_sip_plans__v17
      SELECT * FROM fund_sip_plans;

      DROP TABLE fund_sip_plans;
      ALTER TABLE fund_sip_plans__v17 RENAME TO fund_sip_plans;

      CREATE INDEX fund_sip_plans_status_idx ON fund_sip_plans(status, updated_at DESC);
      CREATE INDEX fund_sip_plans_symbol_idx ON fund_sip_plans(symbol, updated_at DESC);
    `,
  },
  {
    version: 18,
    name: 'fund_profiles',
    sql: `
      CREATE TABLE fund_profiles (
        symbol TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('stock','etf','lof','otc_fund')),
        profile_json TEXT NOT NULL,
        fetched_at TEXT NOT NULL
      ) STRICT;
    `,
  },
  {
    version: 19,
    name: 'instrument_venue',
    sql: `
      ALTER TABLE portfolio_ledger ADD COLUMN venue TEXT NOT NULL DEFAULT 'SH';
      ALTER TABLE portfolio_dividends ADD COLUMN venue TEXT NOT NULL DEFAULT 'SH';
      ALTER TABLE executions ADD COLUMN venue TEXT NOT NULL DEFAULT 'SH';
      ALTER TABLE trade_episodes ADD COLUMN venue TEXT NOT NULL DEFAULT 'SH';
      ALTER TABLE fund_sip_plans ADD COLUMN venue TEXT NOT NULL DEFAULT 'SH';

      UPDATE portfolio_ledger SET venue = CASE
        WHEN kind = 'otc_fund' THEN 'OTC'
        WHEN symbol GLOB '6*' OR symbol GLOB '5[1568]*' THEN 'SH'
        WHEN symbol GLOB '0*' OR symbol GLOB '3*' OR symbol GLOB '1[56]*' THEN 'SZ'
        ELSE 'SH'
      END;

      UPDATE portfolio_dividends SET venue = CASE
        WHEN kind = 'otc_fund' THEN 'OTC'
        WHEN symbol GLOB '6*' OR symbol GLOB '5[1568]*' THEN 'SH'
        WHEN symbol GLOB '0*' OR symbol GLOB '3*' OR symbol GLOB '1[56]*' THEN 'SZ'
        ELSE 'SH'
      END;

      UPDATE executions SET venue = CASE
        WHEN symbol GLOB '6*' OR symbol GLOB '5[1568]*' THEN 'SH'
        WHEN symbol GLOB '0*' OR symbol GLOB '3*' OR symbol GLOB '1[56]*' THEN 'SZ'
        ELSE 'SH'
      END;

      UPDATE trade_episodes SET venue = CASE
        WHEN symbol GLOB '6*' OR symbol GLOB '5[1568]*' THEN 'SH'
        WHEN symbol GLOB '0*' OR symbol GLOB '3*' OR symbol GLOB '1[56]*' THEN 'SZ'
        ELSE 'SH'
      END;

      UPDATE fund_sip_plans SET venue = CASE
        WHEN kind = 'otc_fund' THEN 'OTC'
        WHEN symbol GLOB '6*' OR symbol GLOB '5[1568]*' THEN 'SH'
        WHEN symbol GLOB '0*' OR symbol GLOB '3*' OR symbol GLOB '1[56]*' THEN 'SZ'
        ELSE 'SH'
      END;

      CREATE INDEX portfolio_ledger_account_venue_symbol_idx
        ON portfolio_ledger(account_id, venue, symbol, trade_at);

      CREATE TABLE market_daily_bars__v19 (
        venue TEXT NOT NULL,
        symbol TEXT NOT NULL,
        trade_date TEXT NOT NULL,
        close_micros INTEGER NOT NULL,
        prev_close_micros INTEGER,
        kind TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        PRIMARY KEY (venue, symbol, trade_date)
      ) STRICT;

      INSERT INTO market_daily_bars__v19 (venue, symbol, trade_date, close_micros, prev_close_micros, kind, fetched_at)
      SELECT
        CASE
          WHEN kind = 'otc_fund' THEN 'OTC'
          WHEN symbol GLOB '6*' OR symbol GLOB '5[1568]*' THEN 'SH'
          WHEN symbol GLOB '0*' OR symbol GLOB '3*' OR symbol GLOB '1[56]*' THEN 'SZ'
          ELSE 'SH'
        END,
        symbol, trade_date, close_micros, prev_close_micros, kind, fetched_at
      FROM market_daily_bars;

      DROP TABLE market_daily_bars;
      ALTER TABLE market_daily_bars__v19 RENAME TO market_daily_bars;
      CREATE INDEX market_daily_bars_date_idx ON market_daily_bars(trade_date);

      CREATE TABLE market_bar_sync_meta__v19 (
        venue TEXT NOT NULL,
        symbol TEXT NOT NULL,
        kind TEXT NOT NULL,
        earliest_date TEXT NOT NULL,
        latest_date TEXT NOT NULL,
        last_synced_at TEXT NOT NULL,
        bar_count INTEGER NOT NULL,
        PRIMARY KEY (venue, symbol)
      ) STRICT;

      INSERT INTO market_bar_sync_meta__v19 (venue, symbol, kind, earliest_date, latest_date, last_synced_at, bar_count)
      SELECT
        CASE
          WHEN kind = 'otc_fund' THEN 'OTC'
          WHEN symbol GLOB '6*' OR symbol GLOB '5[1568]*' THEN 'SH'
          WHEN symbol GLOB '0*' OR symbol GLOB '3*' OR symbol GLOB '1[56]*' THEN 'SZ'
          ELSE 'SH'
        END,
        symbol, kind, earliest_date, latest_date, last_synced_at, bar_count
      FROM market_bar_sync_meta;

      DROP TABLE market_bar_sync_meta;
      ALTER TABLE market_bar_sync_meta__v19 RENAME TO market_bar_sync_meta;
    `,
  },
  {
    version: 20,
    name: 'fee_profile_offshore_commission',
    sql: `
      ALTER TABLE fee_profiles ADD COLUMN hk_commission_wan REAL;
      ALTER TABLE fee_profiles ADD COLUMN hk_commission_min_cents INTEGER;
      ALTER TABLE fee_profiles ADD COLUMN us_commission_wan REAL;
      ALTER TABLE fee_profiles ADD COLUMN us_commission_min_cents INTEGER;
      ALTER TABLE fee_profiles ADD COLUMN us_commission_per_share REAL;
    `,
  },
  {
    version: 21,
    name: 'dividend_payout_mode',
    sql: `
      ALTER TABLE portfolio_dividends ADD COLUMN payout_mode TEXT NOT NULL DEFAULT 'cash'
        CHECK (payout_mode IN ('cash','reinvest'));
      ALTER TABLE portfolio_dividends ADD COLUMN reinvest_ledger_id TEXT;
    `,
  },
  {
    version: 22,
    name: 'fund_sip_pause_from_date',
    sql: `
      ALTER TABLE fund_sip_plans ADD COLUMN pause_from_date TEXT;
    `,
  },
  {
    version: 23,
    name: 'portfolio_ledger_cash_outflow',
    sql: `
      ALTER TABLE portfolio_ledger ADD COLUMN cash_outflow_cents INTEGER;

      UPDATE portfolio_ledger
      SET cash_outflow_cents = (
        SELECT o.amount_cents
        FROM fund_sip_occurrences o
        WHERE o.ledger_entry_id = portfolio_ledger.id
      )
      WHERE sip_occurrence_id IS NOT NULL;

      UPDATE portfolio_ledger
      SET cash_outflow_cents = CAST(ROUND(
        (ABS(quantity_micros) / 10000.0) * (price_micros / 10000.0) + (fees_cents / 100.0)
      ) AS INTEGER) * 100
      WHERE kind = 'otc_fund'
        AND side = 'buy'
        AND cash_outflow_cents IS NULL
        AND ABS(
          (ABS(quantity_micros) / 10000.0) * (price_micros / 10000.0) + (fees_cents / 100.0)
          - ROUND((ABS(quantity_micros) / 10000.0) * (price_micros / 10000.0) + (fees_cents / 100.0))
        ) <= 0.15;
    `,
  },
  {
    version: 24,
    name: 'lof_arbitrage',
    sql: `
      CREATE TABLE lof_watchlist (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL UNIQUE,
        notes TEXT,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE lof_arbitrage_snapshots (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        market_price_micros INTEGER,
        reference_nav_micros INTEGER,
        premium_rate_micros INTEGER,
        subscription_status TEXT NOT NULL,
        amount_cents INTEGER,
        fetched_at TEXT NOT NULL
      ) STRICT;

      CREATE INDEX lof_arbitrage_snapshots_symbol_time_idx
        ON lof_arbitrage_snapshots(symbol, fetched_at DESC);

      CREATE TABLE lof_arbitrage_rules (
        id TEXT PRIMARY KEY,
        symbol TEXT,
        direction TEXT NOT NULL CHECK (direction IN ('premium','discount','both')),
        threshold_rate_micros INTEGER NOT NULL,
        min_amount_cents INTEGER,
        require_subscription_open INTEGER NOT NULL DEFAULT 1,
        min_net_spread_micros INTEGER,
        status TEXT NOT NULL CHECK (status IN ('active','paused','triggered')),
        last_triggered_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE INDEX lof_arbitrage_rules_status_idx ON lof_arbitrage_rules(status, updated_at DESC);

      CREATE TABLE lof_arbitrage_events (
        id TEXT PRIMARY KEY,
        rule_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        title TEXT NOT NULL,
        premium_rate_micros INTEGER NOT NULL,
        net_spread_micros INTEGER,
        recommended_path_label TEXT,
        triggered_at TEXT NOT NULL,
        user_action TEXT CHECK (user_action IN ('acknowledged','dismissed')),
        FOREIGN KEY (rule_id) REFERENCES lof_arbitrage_rules(id) ON DELETE CASCADE
      ) STRICT;

      CREATE INDEX lof_arbitrage_events_triggered_idx ON lof_arbitrage_events(triggered_at DESC);
    `,
  },
  {
    version: 25,
    name: 'ledger_chart_snapshot',
    sql: `ALTER TABLE portfolio_ledger ADD COLUMN chart_snapshot TEXT;`,
  },
  {
    version: 26,
    name: 'personal_watchlist_tracking',
    sql: `
      CREATE TABLE personal_watchlist (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        name TEXT NOT NULL,
        venue TEXT NOT NULL,
        quote_currency TEXT NOT NULL,
        kind TEXT NOT NULL,
        starred INTEGER NOT NULL DEFAULT 0 CHECK (starred IN (0, 1)),
        position INTEGER NOT NULL,
        tags_json TEXT NOT NULL DEFAULT '[]',
        waiting_for TEXT NOT NULL DEFAULT '',
        invalidation TEXT NOT NULL DEFAULT '',
        added_price_micros INTEGER CHECK (added_price_micros > 0),
        added_price_at TEXT,
        reminder_id TEXT REFERENCES alert_rules(id),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        removed_at TEXT,
        UNIQUE (venue, symbol)
      ) STRICT;
      CREATE TABLE watchlist_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
      ) STRICT;
      CREATE TABLE watchlist_memberships (
        item_id TEXT NOT NULL REFERENCES personal_watchlist(id) ON DELETE CASCADE,
        group_id TEXT NOT NULL REFERENCES watchlist_groups(id) ON DELETE CASCADE,
        PRIMARY KEY (item_id, group_id)
      ) STRICT;
      CREATE TABLE watchlist_tracking_logs (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL REFERENCES personal_watchlist(id) ON DELETE CASCADE,
        record_date TEXT NOT NULL,
        review TEXT NOT NULL,
        feeling TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (length(trim(review)) > 0 OR length(trim(feeling)) > 0)
      ) STRICT;
      CREATE INDEX watchlist_tracking_date_idx ON watchlist_tracking_logs(item_id, record_date DESC, created_at DESC);
    `,
  },
  {
    version: 27,
    name: 'longhubang_query_cache',
    sql: `
      CREATE TABLE lhb_query_cache (
        cache_key TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        fetched_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      ) STRICT;
    `,
  },
  {
    version: 28,
    name: 'quant_research_module',
    sql: `
      CREATE TABLE quant_research_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
      ) STRICT;
      CREATE TABLE quant_research_runs (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        summary_json TEXT NOT NULL CHECK (json_valid(summary_json)),
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
      ) STRICT;
      CREATE INDEX quant_research_runs_created_idx ON quant_research_runs(created_at DESC);
    `,
  },
];
