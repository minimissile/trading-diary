export const BACKUP_FORMAT = 'trading-diary-backup' as const;
export const BACKUP_FORMAT_VERSION = 1;

export interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  appVersion: string;
  schemaVersion: number;
  exportedAt: string;
  includes: string[];
}

export interface BackupStats {
  tradingPlans: number;
  tradeAlerts: number;
  tradeReviews: number;
  assets: number;
  portfolioLedgerEntries: number;
  portfolioDividends: number;
}

export interface BackupExportInput {
  targetPath: string;
  includeLicense?: boolean;
}

export interface BackupExportResult {
  filePath: string;
  manifest: BackupManifest;
  stats: BackupStats;
}

export interface BackupImportInput {
  sourcePath: string;
}

export interface BackupImportResult {
  manifest: BackupManifest;
  stats: BackupStats;
  requiresRestart: true;
}
