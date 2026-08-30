import type { SipAiPlanHints, SipRecognizedPlanMode } from '../sip/import-hints';

export type LedgerAiRecordKind = 'trade' | 'sip_deduction' | 'dividend' | 'skip';
export type LedgerAiTradeSide = 'buy' | 'sell';

/** AI 从截图识别出的单条持仓/流水记录。 */
export interface LedgerAiExtractedRecord {
  rowIndex: number;
  symbol: string | null;
  instrumentName: string | null;
  side: LedgerAiTradeSide | null;
  tradeAt: string | null;
  price: number | null;
  quantity: number | null;
  amount: number | null;
  fees: number | null;
  note: string | null;
  rawType: string | null;
  recordKind: LedgerAiRecordKind;
  sourceImageIndex: number;
  sourceFileName: string | null;
}

export type LedgerImportPreviewStatus = 'ready' | 'duplicate' | 'error' | 'incomplete' | 'skipped';

export interface LedgerImportPreviewRow {
  rowIndex: number;
  status: LedgerImportPreviewStatus;
  message: string | null;
  recordKind: LedgerAiRecordKind;
  symbol: string | null;
  instrumentName: string | null;
  side: LedgerAiTradeSide | null;
  tradeAt: string | null;
  price: number | null;
  quantity: number | null;
  amount: number | null;
  fees: number | null;
}

export interface LedgerImportPreviewResult {
  rows: LedgerImportPreviewRow[];
  readyCount: number;
  duplicateCount: number;
  errorCount: number;
  incompleteCount: number;
  skippedCount: number;
  tradeReadyCount: number;
  sipReadyCount: number;
}

export interface LedgerImportCommitResult {
  imported: number;
  skippedDuplicate: number;
  skipped: number;
  failed: number;
  sipImported: number;
  sipSkippedDuplicate: number;
  sipPlansCreated: number;
  errors: Array<{ rowIndex: number; message: string }>;
}

/** AI 导入输入（已识别记录）。 */
export interface LedgerAiImportInput {
  accountId?: string;
  records: LedgerAiExtractedRecord[];
  importSipDeductions?: boolean;
  sipPlanHints?: SipAiPlanHints | null;
  sipPlanMode?: SipRecognizedPlanMode;
  sipPlanModeLabel?: string | null;
}

/** 多图截图识别结果。 */
export interface LedgerAiRecognizeResult {
  sourcePaths: string[];
  fileNames: string[];
  records: LedgerAiExtractedRecord[];
  warnings: string[];
  enrichments: string[];
  sipPlanMode: SipRecognizedPlanMode;
  sipPlanModeLabel: string | null;
  sipPlanHints: SipAiPlanHints | null;
  model: string;
}

/** AI 导入预览（含补全后的记录）。 */
export interface LedgerAiImportPreviewResult {
  preview: LedgerImportPreviewResult;
  records: LedgerAiExtractedRecord[];
  enrichments: string[];
}
