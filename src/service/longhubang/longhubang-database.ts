import type { DatabaseSync } from 'node:sqlite';

export interface LhbCacheEntry<T> {
  data: T;
  fetchedAt: string;
  expiresAt: string;
}

export interface LhbCache {
  read<T>(key: string): LhbCacheEntry<T> | null;
  write<T>(key: string, value: LhbCacheEntry<T>): void;
}

/** 缓存已归一化的完整响应，金额为整数分；单次 UPSERT 不会留下半个分页结果。 */
export class LonghubangDatabase implements LhbCache {
  constructor(private readonly db: DatabaseSync) {}

  read<T>(key: string): LhbCacheEntry<T> | null {
    const row = this.db
      .prepare('SELECT payload_json, fetched_at, expires_at FROM lhb_query_cache WHERE cache_key = ?')
      .get(`v2:${key}`) as { payload_json: string; fetched_at: string; expires_at: string } | undefined;
    if (!row) return null;
    try {
      return { data: JSON.parse(row.payload_json) as T, fetchedAt: row.fetched_at, expiresAt: row.expires_at };
    } catch {
      return null;
    }
  }

  write<T>(key: string, value: LhbCacheEntry<T>): void {
    this.db
      .prepare(
        `INSERT INTO lhb_query_cache (cache_key, payload_json, fetched_at, expires_at)
      VALUES (?, ?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET
      payload_json = excluded.payload_json, fetched_at = excluded.fetched_at, expires_at = excluded.expires_at`,
      )
      .run(`v2:${key}`, JSON.stringify(value.data), value.fetchedAt, value.expiresAt);
    this.db
      .prepare(
        `DELETE FROM lhb_query_cache WHERE cache_key IN
      (SELECT cache_key FROM lhb_query_cache ORDER BY fetched_at DESC LIMIT -1 OFFSET 200)`,
      )
      .run();
  }
}
