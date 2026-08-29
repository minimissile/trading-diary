/** CSV 可映射的定投扣款字段。 */
export type SipCsvField = 'symbol' | 'tradeAt' | 'nav' | 'amount' | 'quantity' | 'fees';

/** 列索引映射（-1 表示未映射）。 */
export type SipColumnMapping = Record<SipCsvField, number>;

export interface SipCsvParseResult {
  sourcePath: string;
  fileName: string;
  headers: string[];
  rowCount: number;
  previewRows: string[][];
  suggestedMapping: SipColumnMapping;
}

export type SipImportPreviewStatus = 'ready' | 'duplicate' | 'error';

export interface SipImportPreviewRow {
  rowIndex: number;
  status: SipImportPreviewStatus;
  message: string | null;
  symbol: string | null;
  tradeAt: string | null;
  nav: number | null;
  amount: number | null;
  quantity: number | null;
  fees: number | null;
  matchedPlanName: string | null;
}

export interface SipImportPreviewResult {
  rows: SipImportPreviewRow[];
  readyCount: number;
  duplicateCount: number;
  errorCount: number;
}

export interface SipImportCommitResult {
  imported: number;
  skippedDuplicate: number;
  failed: number;
  linkedToPlan: number;
  ledgerOnly: number;
  errors: Array<{ rowIndex: number; message: string }>;
}

export interface SipImportInput {
  sourcePath: string;
  accountId?: string;
  planId?: string;
  mapping: SipColumnMapping;
}

/** AI 从截图识别出的单条扣款记录。 */
export interface SipAiExtractedRecord {
  rowIndex: number;
  symbol: string | null;
  fundName: string | null;
  tradeAt: string | null;
  nav: number | null;
  amount: number | null;
  quantity: number | null;
  fees: number | null;
}

/** 截图识别结果。 */
export interface SipAiRecognizeResult {
  sourcePath: string;
  fileName: string;
  records: SipAiExtractedRecord[];
  warnings: string[];
  model: string;
}

/** AI 导入输入（已识别记录）。 */
export interface SipAiImportInput {
  accountId?: string;
  planId?: string;
  records: SipAiExtractedRecord[];
}
