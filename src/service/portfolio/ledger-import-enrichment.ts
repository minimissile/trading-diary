import type { LedgerAiExtractedRecord } from '../../shared/portfolio/ledger-import-types';
import { marketService } from '../market/market-service';
import { searchInstruments } from '../market/eastmoney/search-service';
import { toTradeDateKey } from '../sip/sip-row-normalizer';

export interface LedgerImportEnrichmentResult {
  records: LedgerAiExtractedRecord[];
  enrichments: string[];
}

/** 根据名称匹配与历史行情补全 AI 识别记录中的缺失字段。 */
export async function enrichLedgerExtractedRecords(
  records: LedgerAiExtractedRecord[],
): Promise<LedgerImportEnrichmentResult> {
  const enrichments: string[] = [];
  const nextRecords = await Promise.all(records.map((record) => enrichRecord(record, enrichments)));
  return { records: nextRecords, enrichments };
}

async function enrichRecord(
  record: LedgerAiExtractedRecord,
  enrichments: string[],
): Promise<LedgerAiExtractedRecord> {
  if (record.recordKind === 'dividend' || record.recordKind === 'skip') return record;

  let next = { ...record };

  if (!next.symbol && next.instrumentName) {
    const resolvedSymbol = await resolveSymbolFromName(next.instrumentName);
    if (resolvedSymbol) {
      next = { ...next, symbol: resolvedSymbol };
      enrichments.push(`第 ${next.rowIndex} 行：已根据名称匹配标的 ${resolvedSymbol}`);
    }
  }

  const dateKey = toTradeDateKey(next.tradeAt);
  if (!next.symbol || !dateKey) return next;

  if (next.price === null) {
    try {
      const lookup = await marketService.lookupHistoricalPriceOnDate(next.symbol, dateKey);
      if (lookup) {
        next = { ...next, price: lookup.nav };
        if (lookup.exact) {
          enrichments.push(`第 ${next.rowIndex} 行：已自动填充 ${dateKey} 价格 ${lookup.nav}`);
        } else {
          enrichments.push(
            `第 ${next.rowIndex} 行：未找到 ${dateKey} 当日价格，已使用 ${lookup.navDate} 价格 ${lookup.nav}`,
          );
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : '未知错误';
      enrichments.push(`第 ${next.rowIndex} 行：查询 ${next.symbol} 历史价格失败（${detail}）`);
    }
  }

  if (next.quantity === null && next.amount !== null && next.price !== null && next.price > 0) {
    next = { ...next, quantity: next.amount / next.price };
    enrichments.push(`第 ${next.rowIndex} 行：已根据金额与价格推算份额 ${next.quantity?.toFixed(4)}`);
  }

  if (next.price === null && next.amount !== null && next.quantity !== null && next.quantity > 0) {
    next = { ...next, price: next.amount / next.quantity };
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
