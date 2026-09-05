import type { SipRecognizedPlanMode } from '../sip/import-hints';
import type { SipAiPlanHints } from '../sip/import-types';

export type LedgerAiRecordKind = 'trade' | 'sip_deduction' | 'dividend' | 'skip';
export type LedgerAiTradeSide = 'buy' | 'sell';
/** 用户导入时选择的资产类型：股票（含场内 ETF/LOF）或场外基金。 */
export type LedgerAiImportAssetKind = 'stock' | 'fund';
/** @deprecated 由 importAssetKind 映射，保留用于入库口径。 */
export type LedgerAiTradeChannel = 'exchange' | 'otc';

export const LEDGER_IMPORT_ASSET_KIND_LABELS: Record<LedgerAiImportAssetKind, string> = {
  stock: '股票（含场内基金）',
  fund: '场外基金',
};

export function importAssetKindToTradeChannel(kind: LedgerAiImportAssetKind): LedgerAiTradeChannel {
  return kind === 'fund' ? 'otc' : 'exchange';
}

export const LEDGER_TRADE_CHANNEL_LABELS: Record<LedgerAiTradeChannel, string> = {
  otc: '场外基金',
  exchange: '场内交易',
};

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
  /** 单条覆盖批次默认渠道；null 表示沿用 defaultTradeChannel。 */
  tradeChannel: LedgerAiTradeChannel | null;
  /** 场外基金确认日（T+1），用于净值查询；申请日见 tradeAt。 */
  confirmAt: string | null;
  /** amount 是否为确认金额（已扣手续费），用于份额推算。 */
  amountIsNetConfirmed: boolean;
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
  /** 用户选择的资产类型；决定价格/份额/入库口径。 */
  importAssetKind?: LedgerAiImportAssetKind;
  /** @deprecated 使用 importAssetKind */
  defaultTradeChannel?: LedgerAiTradeChannel;
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
  importAssetKind: LedgerAiImportAssetKind;
  /** @deprecated 由 importAssetKind 推导 */
  tradeChannel: LedgerAiTradeChannel;
  tradeChannelLabel: string | null;
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
