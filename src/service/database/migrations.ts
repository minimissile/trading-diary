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
];
