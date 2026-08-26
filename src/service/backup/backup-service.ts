import AdmZip from 'adm-zip';
import fs from 'node:fs';
import path from 'node:path';
import { rm } from 'node:fs/promises';
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  type BackupExportInput,
  type BackupExportResult,
  type BackupImportInput,
  type BackupImportResult,
  type BackupManifest,
  type BackupStats,
} from '../../shared/backup/types';
import { AppDatabase } from '../database/database';
import { migrations } from '../database/migrations';

const SUPPORTED_SCHEMA_VERSION = migrations.at(-1)?.version ?? 0;
const MANIFEST_ENTRY = 'manifest.json';
const DATABASE_ENTRY = 'database/app.sqlite';

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

function walkFiles(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) return [];
  const files: string[] = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else if (entry.isFile()) files.push(fullPath);
    }
  }
  return files;
}

function addDirectoryToZip(zip: AdmZip, sourceDir: string, zipPrefix: string): void {
  for (const filePath of walkFiles(sourceDir)) {
    zip.addLocalFile(filePath, path.join(zipPrefix, path.relative(sourceDir, path.dirname(filePath))));
  }
}

function readManifest(zip: AdmZip): BackupManifest {
  const entry = zip.getEntry(MANIFEST_ENTRY);
  if (!entry) throw new BackupError('备份文件缺少 manifest.json');
  let parsed: unknown;
  try {
    parsed = JSON.parse(entry.getData().toString('utf8'));
  } catch {
    throw new BackupError('manifest.json 格式无效');
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    (parsed as BackupManifest).format !== BACKUP_FORMAT ||
    (parsed as BackupManifest).formatVersion !== BACKUP_FORMAT_VERSION
  ) {
    throw new BackupError('不是受支持的交易日记备份文件');
  }
  const manifest = parsed as BackupManifest;
  if (typeof manifest.schemaVersion !== 'number' || manifest.schemaVersion > SUPPORTED_SCHEMA_VERSION) {
    throw new BackupError(
      `备份的数据库版本 (v${manifest.schemaVersion}) 高于当前应用支持版本 (v${SUPPORTED_SCHEMA_VERSION})`,
    );
  }
  return manifest;
}

export class BackupService {
  constructor(
    private readonly dataDir: string,
    private readonly database: AppDatabase,
    private readonly appVersion: string,
  ) {}

  exportBackup(input: BackupExportInput): BackupExportResult {
    const targetPath = path.resolve(input.targetPath);
    if (!targetPath.toLowerCase().endsWith('.zip')) {
      throw new BackupError('备份文件必须使用 .zip 扩展名');
    }

    this.database.checkpoint();
    const stats = this.collectStats(this.database);

    const includes = ['database'];
    const manifest: BackupManifest = {
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      appVersion: this.appVersion,
      schemaVersion: this.database.schemaVersion(),
      exportedAt: new Date().toISOString(),
      includes,
    };

    const zip = new AdmZip();
    zip.addFile(MANIFEST_ENTRY, Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
    zip.addLocalFile(this.database.filePath, path.dirname(DATABASE_ENTRY));

    const assetsDir = path.join(this.dataDir, 'assets');
    if (fs.existsSync(assetsDir)) {
      addDirectoryToZip(zip, assetsDir, 'assets');
      includes.push('assets');
    }

    const llmSettingsPath = path.join(this.dataDir, 'llm', 'settings.json');
    if (fs.existsSync(llmSettingsPath)) {
      zip.addLocalFile(llmSettingsPath, 'llm');
      includes.push('llm-settings');
    }

    if (input.includeLicense !== false) {
      const licensePath = path.join(this.dataDir, 'license.json');
      if (fs.existsSync(licensePath)) {
        zip.addLocalFile(licensePath, '.');
        includes.push('license');
      }
    }

    manifest.includes = includes;
    zip.updateFile(MANIFEST_ENTRY, Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
    zip.writeZip(targetPath);

    return { filePath: targetPath, manifest, stats };
  }

  importBackup(input: BackupImportInput, closeDatabase: () => void): BackupImportResult {
    const sourcePath = path.resolve(input.sourcePath);
    if (!fs.existsSync(sourcePath)) throw new BackupError('备份文件不存在');

    const zip = new AdmZip(sourcePath);
    const manifest = readManifest(zip);

    if (!zip.getEntry(DATABASE_ENTRY)) {
      throw new BackupError('备份文件缺少 database/app.sqlite');
    }

    const tempDir = path.join(this.dataDir, '.import-temp', `${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      zip.extractAllTo(tempDir, true);

      const extractedDbPath = path.join(tempDir, DATABASE_ENTRY);
      if (!fs.existsSync(extractedDbPath)) {
        throw new BackupError('解压后的数据库文件不存在');
      }

      closeDatabase();

      const dbDir = path.join(this.dataDir, 'database');
      fs.mkdirSync(dbDir, { recursive: true });
      const dbPath = path.join(dbDir, 'app.sqlite');
      fs.copyFileSync(extractedDbPath, dbPath);
      for (const suffix of ['-wal', '-shm'] as const) {
        const sidecar = `${dbPath}${suffix}`;
        if (fs.existsSync(sidecar)) fs.rmSync(sidecar, { force: true });
      }

      const extractedAssets = path.join(tempDir, 'assets');
      const targetAssets = path.join(this.dataDir, 'assets');
      if (fs.existsSync(targetAssets)) {
        fs.rmSync(targetAssets, { recursive: true, force: true });
      }
      if (fs.existsSync(extractedAssets)) {
        fs.cpSync(extractedAssets, targetAssets, { recursive: true });
      }

      const extractedLlmSettings = path.join(tempDir, 'llm', 'settings.json');
      if (fs.existsSync(extractedLlmSettings)) {
        const llmDir = path.join(this.dataDir, 'llm');
        fs.mkdirSync(llmDir, { recursive: true });
        fs.copyFileSync(extractedLlmSettings, path.join(llmDir, 'settings.json'));
      }

      const extractedLicense = path.join(tempDir, 'license.json');
      if (fs.existsSync(extractedLicense)) {
        fs.copyFileSync(extractedLicense, path.join(this.dataDir, 'license.json'));
      }

      const rewriteDb = new AppDatabase(dbPath);
      let stats: BackupStats;
      try {
        rewriteDb.rewriteAssetPaths(this.dataDir);
        stats = this.collectStats(rewriteDb);
      } finally {
        rewriteDb.close();
      }

      return {
        manifest,
        stats,
        requiresRestart: true,
      };
    } finally {
      void rm(tempDir, { recursive: true, force: true });
    }
  }

  private collectStats(database: AppDatabase): BackupStats {
    const schemaVersion = database.schemaVersion();
    return {
      tradingPlans: schemaVersion >= 2 ? database.countTradingPlans() : 0,
      tradeAlerts: schemaVersion >= 2 ? database.countTradeAlerts() : 0,
      tradeReviews: schemaVersion >= 2 ? database.countTradeReviews() : 0,
      assets: database.assetStats().count,
      portfolioLedgerEntries: schemaVersion >= 3 ? database.portfolio.countLedgerEntries() : 0,
      portfolioDividends: schemaVersion >= 3 ? database.portfolio.countDividends() : 0,
    };
  }
}
