import type { LedgerAiExtractedRecord } from '../../shared/portfolio/ledger-import-types';
import { lookupImportPriceOnDate } from '../market/eastmoney/historical-price-service';
import { searchInstruments } from '../market/eastmoney/search-service';
import { toTradeDateKey } from '../sip/sip-row-normalizer';
import {
  canDeriveFundFromAmount,
  computeFundQuantityFromAmount,
  estimateOtcSubscriptionFee,
  hasFundConfirmationData,
  isOtcTradeChannel,
  resolveFundNavLookupDate,
  resolveInvestableAmount,
} from './fund-subscription';
import { resolveEffectiveTradeChannel, resolveImportTradeChannel } from './ledger-import-instrument';
import type { LedgerImportEnrichmentOptions } from './ledger-import-enrichment.types';

export type { LedgerImportEnrichmentOptions, LedgerImportEnrichmentResult } from './ledger-import-enrichment.types';

/** 根据名称匹配与历史行情补全 AI 识别记录中的缺失字段。 */
export async function enrichLedgerExtractedRecords(
  records: LedgerAiExtractedRecord[],
  options: LedgerImportEnrichmentOptions = {},
): Promise<import('./ledger-import-enrichment.types').LedgerImportEnrichmentResult> {
  const tradeChannel = resolveImportTradeChannel(options);
  const recalculateDerivedFields = options.recalculateDerivedFields ?? false;
  const enrichments: string[] = [];
  const nextRecords = await Promise.all(
    records.map((record) =>
      enrichRecord(record, enrichments, tradeChannel, recalculateDerivedFields),
    ),
  );
  return { records: nextRecords, enrichments };
}

async function enrichRecord(
  record: LedgerAiExtractedRecord,
  enrichments: string[],
  defaultTradeChannel: import('../../shared/portfolio/ledger-import-types').LedgerAiTradeChannel,
  recalculateDerivedFields: boolean,
): Promise<LedgerAiExtractedRecord> {
  if (record.recordKind === 'dividend' || record.recordKind === 'skip') return record;

  let next = { ...record };
  const tradeChannel = resolveEffectiveTradeChannel(next, defaultTradeChannel);

  if (!next.symbol && next.instrumentName) {
    const resolvedSymbol = await resolveSymbolFromName(next.instrumentName);
    if (resolvedSymbol) {
      next = { ...next, symbol: resolvedSymbol };
      enrichments.push(`第 ${next.rowIndex} 行：已根据名称匹配标的 ${resolvedSymbol}`);
    }
  }

  const dateKey = toTradeDateKey(next.tradeAt);
  if (!next.symbol || !dateKey) return next;

  const hasCompleteQuote = hasFundConfirmationData(next);
  if (hasCompleteQuote && !recalculateDerivedFields) {
    return next;
  }

  if (isOtcTradeChannel(tradeChannel) && !hasFundConfirmationData(next)) {
    if (!canDeriveFundFromAmount(next)) {
      enrichments.push(
        `第 ${next.rowIndex} 行：缺少确认净值/份额，请上传「记录详情」截图（含确认金额、净值、份额）或手动填写`,
      );
      return next;
    }
  }

  const navDateKey = isOtcTradeChannel(tradeChannel)
    ? resolveFundNavLookupDate(next.tradeAt, next.confirmAt)
    : dateKey;

  if (!navDateKey) return next;

  const shouldLookupPrice =
    next.price === null || (recalculateDerivedFields && next.amount !== null && next.quantity === null);

  if (shouldLookupPrice) {
    try {
      const lookup = await lookupImportPriceOnDate(next.symbol, navDateKey, tradeChannel);
      if (lookup) {
        next = { ...next, price: lookup.nav };
        if (lookup.exact) {
          enrichments.push(
            `第 ${next.rowIndex} 行：已自动填充 ${navDateKey} ${isOtcTradeChannel(tradeChannel) ? '确认净值' : '价格'} ${lookup.nav}`,
          );
        } else {
          enrichments.push(
            `第 ${next.rowIndex} 行：未找到 ${navDateKey} 当日价格，已使用 ${lookup.navDate} 净值 ${lookup.nav}`,
          );
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : '未知错误';
      enrichments.push(`第 ${next.rowIndex} 行：查询 ${next.symbol} 历史价格失败（${detail}）`);
    }
  }

  if (next.amount !== null && next.price !== null && next.price > 0 && next.quantity === null) {
    let fees = next.fees;
    if (
      fees === null &&
      isOtcTradeChannel(tradeChannel) &&
      !next.amountIsNetConfirmed &&
      next.amount !== null
    ) {
      fees = estimateOtcSubscriptionFee(next.amount);
      next = { ...next, fees };
    }
    const resolvedFees = fees ?? 0;
    const derivedQuantity = isOtcTradeChannel(tradeChannel)
      ? computeFundQuantityFromAmount(next.amount, next.price, resolvedFees, next.amountIsNetConfirmed)
      : Math.round(resolveInvestableAmount(next.amount, resolvedFees, next.amountIsNetConfirmed) / next.price);
    next = { ...next, quantity: derivedQuantity };
    enrichments.push(
      `第 ${next.rowIndex} 行：已根据金额与${isOtcTradeChannel(tradeChannel) ? '净值' : '价格'}推算份额 ${next.quantity?.toFixed(isOtcTradeChannel(tradeChannel) ? 2 : 4)}`,
    );
  }

  if (next.price === null && next.amount !== null && next.quantity !== null && next.quantity > 0) {
    const fees = next.fees ?? 0;
    const investable = resolveInvestableAmount(next.amount, fees, next.amountIsNetConfirmed);
    next = { ...next, price: investable / next.quantity };
    enrichments.push(`第 ${next.rowIndex} 行：已根据金额与份额推算价格 ${next.price?.toFixed(4)}`);
  }

  return next;
}

async function resolveSymbolFromName(name: string): Promise<string | null> {
  const keyword = name.trim();
  if (!keyword) return null;

  const hits = await searchInstruments(keyword, 8);
  const normalizedKeyword = normalizeName(keyword);
  const exact = hits.find((hit) => normalizeName(hit.name) === normalizedKeyword);
  if (exact?.symbol) return exact.symbol;

  const contains = hits.find(
    (hit) =>
      normalizeName(hit.name).includes(normalizedKeyword) ||
      normalizedKeyword.includes(normalizeName(hit.name)),
  );
  return contains?.symbol ?? hits[0]?.symbol ?? null;
}

function normalizeName(name: string): string {
  return name.replace(/\s+/gu, '').toLowerCase();
}
