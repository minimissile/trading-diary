import type { InstrumentKind } from '../../shared/market/types';
import type { InstrumentVenue } from '../../shared/market/venues';
import type {
  LedgerAiExtractedRecord,
  LedgerAiImportAssetKind,
  LedgerAiTradeChannel,
} from '../../shared/portfolio/ledger-import-types';
import { importAssetKindToTradeChannel } from '../../shared/portfolio/ledger-import-types';
import { marketService } from '../market/market-service';

export interface ResolvedImportInstrument {
  symbol: string;
  kind: InstrumentKind;
  venue: InstrumentVenue;
}

export function resolveEffectiveTradeChannel(
  record: Pick<LedgerAiExtractedRecord, 'tradeChannel'>,
  defaultChannel: LedgerAiTradeChannel,
): LedgerAiTradeChannel {
  return record.tradeChannel ?? defaultChannel;
}

export function resolveImportTradeChannel(input: {
  importAssetKind?: LedgerAiImportAssetKind;
  defaultTradeChannel?: LedgerAiTradeChannel;
}): LedgerAiTradeChannel {
  if (input.importAssetKind) {
    return importAssetKindToTradeChannel(input.importAssetKind);
  }
  return input.defaultTradeChannel ?? 'exchange';
}

/** 场外渠道：LOF/ETF 按场外基金入库（OTC venue）。 */
export async function resolveImportInstrument(
  symbol: string,
  channel: LedgerAiTradeChannel,
): Promise<ResolvedImportInstrument> {
  const instrument = await marketService.resolve(symbol);
  if (channel === 'otc') {
    if (instrument.kind === 'lof' || instrument.kind === 'etf' || instrument.kind === 'otc_fund') {
      return { symbol: instrument.symbol, kind: 'otc_fund', venue: 'OTC' };
    }
  }
  return {
    symbol: instrument.symbol,
    kind: instrument.kind,
    venue: instrument.venue,
  };
}

const OTC_HINT = /蚂蚁|支付宝|天天基金|理财|场外|基金资产|持有份额|确认份额|我的定投|资产详情/u;
const EXCHANGE_HINT = /同花顺|交割|股东账户|证券买入|证券卖出|成交时间|成交明细|券商|营业部|股票账户/u;

export function inferTradeChannelFromText(text: string): LedgerAiTradeChannel | null {
  const normalized = text.trim();
  if (!normalized) return null;
  const otc = OTC_HINT.test(normalized);
  const exchange = EXCHANGE_HINT.test(normalized);
  if (otc && !exchange) return 'otc';
  if (exchange && !otc) return 'exchange';
  return null;
}

export function parseTradeChannel(raw: unknown): LedgerAiTradeChannel | null {
  if (raw === 'otc' || raw === 'fund' || raw === 'off_exchange') return 'otc';
  if (raw === 'exchange' || raw === 'on_exchange' || raw === 'broker') return 'exchange';
  if (typeof raw === 'string') {
    return inferTradeChannelFromText(raw);
  }
  return null;
}

export function mergeRecognizedTradeChannel(
  channels: Array<LedgerAiTradeChannel | null>,
  fallback: LedgerAiTradeChannel = 'exchange',
): LedgerAiTradeChannel {
  const otcCount = channels.filter((item) => item === 'otc').length;
  const exchangeCount = channels.filter((item) => item === 'exchange').length;
  if (otcCount > exchangeCount) return 'otc';
  if (exchangeCount > otcCount) return 'exchange';
  return fallback;
}
