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
];
