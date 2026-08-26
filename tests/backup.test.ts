import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppDatabase } from '../src/service/database/database';
import { BackupService } from '../src/service/backup/backup-service';

const temporaryDirectories: string[] = [];

function temporaryDirectory(prefix: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe('BackupService', () => {
  it('导出并在另一目录完整恢复交易数据', () => {
    const sourceDir = temporaryDirectory('td-backup-source-');
    const targetDir = temporaryDirectory('td-backup-target-');
    const sourceDbPath = path.join(sourceDir, 'database', 'app.sqlite');
    const hash = 'b'.repeat(64);
    const shard = path.join(hash.slice(0, 2), hash.slice(2, 4));
    const originalPath = path.join(sourceDir, 'assets/original', shard, `${hash}.png`);
    const previewPath = path.join(sourceDir, 'assets/preview', shard, `${hash}.webp`);

    fs.mkdirSync(path.dirname(originalPath), { recursive: true });
    fs.mkdirSync(path.dirname(previewPath), { recursive: true });
    fs.writeFileSync(originalPath, 'fake-image');
    fs.writeFileSync(previewPath, 'fake-preview');

    const sourceDb = new AppDatabase(sourceDbPath);
    sourceDb.createTradingPlan({
      symbol: '600519.SH',
      name: '贵州茅台',
      direction: 'long',
      thesis: '长期分红观察',
      entryPrice: 1500,
      stopPrice: 1400,
      targetPrice: 1700,
      riskAmount: 5000,
      activateNow: false,
    });
    sourceDb.insertAsset({
      hash,
      originalName: 'chart.png',
      mediaType: 'image/png',
      originalBytes: 256,
      previewBytes: 128,
      width: 100,
      height: 80,
      originalPath,
      previewPath,
      createdAt: new Date(0).toISOString(),
    });
    sourceDb.close();

    const exportPath = path.join(sourceDir, 'backup.zip');
    const exporterDb = new AppDatabase(sourceDbPath);
    const exporter = new BackupService(sourceDir, exporterDb, '1.2.0');
    const exported = exporter.exportBackup({ targetPath: exportPath, includeLicense: false });
    exporterDb.close();
    expect(fs.existsSync(exportPath)).toBe(true);
    expect(exported.stats.tradingPlans).toBe(1);
    expect(exported.stats.assets).toBe(1);

    const targetDbPath = path.join(targetDir, 'database', 'app.sqlite');
    fs.mkdirSync(path.dirname(targetDbPath), { recursive: true });
    fs.writeFileSync(targetDbPath, fs.readFileSync(sourceDbPath));
    const importerDb = new AppDatabase(targetDbPath);
    const importer = new BackupService(targetDir, importerDb, '1.2.0');
    const imported = importer.importBackup({ sourcePath: exportPath }, () => importerDb.close());

    expect(imported.requiresRestart).toBe(true);
    expect(imported.stats.tradingPlans).toBe(1);
    expect(imported.stats.assets).toBe(1);

    const restored = new AppDatabase(targetDbPath);
    try {
      expect(restored.countTradingPlans()).toBe(1);
      expect(restored.assetStats().count).toBe(1);
      const restoredOriginal = restored.assetPath(hash, 'original');
      expect(restoredOriginal).toBe(path.join(targetDir, 'assets/original', shard, `${hash}.png`));
      expect(fs.existsSync(restoredOriginal ?? '')).toBe(true);
    } finally {
      restored.close();
    }
  });
});
