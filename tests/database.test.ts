import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppDatabase } from '../src/service/database/database';

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-runtime-db-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe('AppDatabase', () => {
  it('执行数据库迁移并汇总图片资源元数据', () => {
    const database = new AppDatabase(path.join(temporaryDirectory(), 'database', 'app.sqlite'));

    expect(database.schemaVersion()).toBe(10);
    expect(database.sqliteVersion()).toMatch(/^3\./u);
    expect(database.assetStats()).toEqual({ count: 0, originalBytes: 0, previewBytes: 0 });

    database.insertAsset({
      hash: 'a'.repeat(64),
      originalName: 'sample.png',
      mediaType: 'image/png',
      originalBytes: 128,
      previewBytes: 64,
      width: 10,
      height: 20,
      originalPath: '/assets/original/sample.png',
      previewPath: '/assets/preview/sample.webp',
      createdAt: new Date(0).toISOString(),
    });

    expect(database.hasAsset('a'.repeat(64))).toBe(true);
    expect(database.assetStats()).toEqual({ count: 1, originalBytes: 128, previewBytes: 64 });
    database.close();
  });
});
