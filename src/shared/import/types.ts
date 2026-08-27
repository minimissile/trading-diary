import type { ExecutionSide } from '../episodes/types';

/** CSV 可映射的成交字段。 */
export type ExecutionCsvField = 'symbol' | 'side' | 'quantity' | 'price' | 'fees' | 'tradeAt';

/** 列索引映射（-1 表示未映射）。 */
export type ExecutionColumnMapping = Record<ExecutionCsvField, number>;

export interface CsvParseResult {
  sourcePath: string;
  fileName: string;
  headers: string[];
  rowCount: number;
  previewRows: string[][];
  suggestedMapping: ExecutionColumnMapping;
}

export type ImportPreviewStatus = 'ready' | 'duplicate' | 'error';

export interface ExecutionImportPreviewRow {
  rowIndex: number;
  status: ImportPreviewStatus;
  message: string | null;
  symbol: string | null;
  side: ExecutionSide | null;
  quantity: number | null;
  price: number | null;
  fees: number | null;
  tradeAt: string | null;
}

export interface ExecutionImportPreviewResult {
  rows: ExecutionImportPreviewRow[];
  readyCount: number;
  duplicateCount: number;
  errorCount: number;
}

export interface ExecutionImportCommitResult {
  imported: number;
  skippedDuplicate: number;
  failed: number;
  closedEpisodes: number;
  errors: Array<{ rowIndex: number; message: string }>;
}

export interface ExecutionImportInput {
  sourcePath: string;
  accountId?: string;
  mapping: ExecutionColumnMapping;
}
