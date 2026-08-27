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
];
