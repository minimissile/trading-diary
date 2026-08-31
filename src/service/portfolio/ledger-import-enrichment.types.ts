import type { LedgerAiExtractedRecord } from '../../shared/portfolio/ledger-import-types';
import type { LedgerAiImportAssetKind } from '../../shared/portfolio/ledger-import-types';

export interface LedgerImportEnrichmentOptions {
  importAssetKind?: LedgerAiImportAssetKind;
  /** @deprecated 使用 importAssetKind */
  defaultTradeChannel?: import('../../shared/portfolio/ledger-import-types').LedgerAiTradeChannel;
  /** 重新预览时补全缺失字段；已有确认净值/份额时不覆盖。 */
  recalculateDerivedFields?: boolean;
}

export interface LedgerImportEnrichmentResult {
  records: LedgerAiExtractedRecord[];
  enrichments: string[];
}
