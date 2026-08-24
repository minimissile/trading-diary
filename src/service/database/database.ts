import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AssetStats } from '../../shared/api.types';
import { migrations } from './migrations';

export interface AssetRecord {
  hash: string;
  originalName: string;
  mediaType: string;
  originalBytes: number;
  previewBytes: number;
  width: number | null;
  height: number | null;
  originalPath: string;
  previewPath: string;
  createdAt: string;
}

interface VersionRow {
  version: number;
}

interface SqliteVersionRow {
  version: string;
}

interface AssetPathRow {
  original_path: string;
  preview_path: string;
}

export class AppDatabase {
  readonly filePath: string;
  private readonly db: DatabaseSync;

  constructor(filePath: string) {
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.db = new DatabaseSync(filePath, {
      timeout: 5_000,
      allowExtension: false,
      enableForeignKeyConstraints: true,
      defensive: true,
    });

    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      ) STRICT;
    `);

    this.applyMigrations();
  }

  close(): void {
    this.db.close();
  }

  sqliteVersion(): string {
    const row = this.db.prepare('SELECT sqlite_version() AS version').get() as unknown as SqliteVersionRow;
    return row.version;
  }

  schemaVersion(): number {
    const row = this.db
      .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations')
      .get() as unknown as VersionRow;
    return row.version;
  }

  hasAsset(hash: string): boolean {
    return this.db.prepare('SELECT 1 FROM assets WHERE hash = ? LIMIT 1').get(hash) !== undefined;
  }

  insertAsset(asset: AssetRecord): void {
    this.db
      .prepare(`
        INSERT OR IGNORE INTO assets (
          hash, original_name, media_type, original_bytes, preview_bytes,
          width, height, original_path, preview_path, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        asset.hash,
        asset.originalName,
        asset.mediaType,
        asset.originalBytes,
        asset.previewBytes,
        asset.width,
        asset.height,
        asset.originalPath,
        asset.previewPath,
        asset.createdAt,
      );
  }

  assetStats(): AssetStats {
    const row = this.db
      .prepare(`
        SELECT
          COUNT(*) AS count,
          COALESCE(SUM(original_bytes), 0) AS originalBytes,
          COALESCE(SUM(preview_bytes), 0) AS previewBytes
        FROM assets
      `)
      .get() as unknown as AssetStats;

    return row;
  }

  assetPath(hash: string, variant: 'original' | 'preview'): string | null {
    const row = this.db
      .prepare('SELECT original_path, preview_path FROM assets WHERE hash = ?')
      .get(hash) as unknown as AssetPathRow | undefined;
    if (!row) return null;
    return variant === 'preview' ? row.preview_path : row.original_path;
  }

  private applyMigrations(): void {
    const appliedRows = this.db.prepare('SELECT version FROM schema_migrations').all() as unknown as VersionRow[];
    const applied = new Set(appliedRows.map((row) => row.version));
    const insertMigration = this.db.prepare(
      'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
    );

    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;

      this.db.exec('BEGIN IMMEDIATE');
      try {
        this.db.exec(migration.sql);
        insertMigration.run(migration.version, migration.name, new Date().toISOString());
        this.db.exec('COMMIT');
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    }
  }
}
