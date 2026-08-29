import type { SipAiExtractedRecord } from '../../shared/sip/import-types';
import { marketService } from '../market/market-service';
import { searchInstruments } from '../market/eastmoney/search-service';
import { toTradeDateKey } from './sip-row-normalizer';

export interface SipImportEnrichmentResult {
  records: SipAiExtractedRecord[];
  enrichments: string[];
}

/** 根据历史行情/净值补全 AI 识别记录中的缺失字段。 */
export async function enrichSipExtractedRecords(
  records: SipAiExtractedRecord[],
): Promise<SipImportEnrichmentResult> {
  const enrichments: string[] = [];
  const nextRecords = await Promise.all(records.map((record) => enrichRecord(record, enrichments)));
  return { records: nextRecords, enrichments };
}

async function enrichRecord(
  record: SipAiExtractedRecord,
  enrichments: string[],
): Promise<SipAiExtractedRecord> {
  let next = { ...record };

  if (!next.symbol && next.fundName) {
    const resolvedSymbol = await resolveSymbolFromFundName(next.fundName);
    if (resolvedSymbol) {
      next = { ...next, symbol: resolvedSymbol };
      enrichments.push(`第 ${next.rowIndex} 行：已根据基金名称匹配标的 ${resolvedSymbol}`);
    }
  }

  const dateKey = toTradeDateKey(next.tradeAt);
  if (!next.symbol || !dateKey || next.nav !== null) {
    return next;
  }

  try {
    const lookup = await marketService.lookupHistoricalPriceOnDate(next.symbol, dateKey);
    if (!lookup) {
      enrichments.push(`第 ${next.rowIndex} 行：未找到 ${next.symbol} 在 ${dateKey} 附近的历史净值`);
      return next;
    }

    next = { ...next, nav: lookup.nav };
    if (lookup.exact) {
      enrichments.push(`第 ${next.rowIndex} 行：已自动填充 ${dateKey} 净值 ${lookup.nav}`);
    } else {
      enrichments.push(
        `第 ${next.rowIndex} 行：未找到 ${dateKey} 当日净值，已使用 ${lookup.navDate} 净值 ${lookup.nav}`,
      );
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : '未知错误';
    enrichments.push(`第 ${next.rowIndex} 行：查询 ${next.symbol} 历史净值失败（${detail}），请手动填写`);
  }

  return next;
}

async function resolveSymbolFromFundName(fundName: string): Promise<string | null> {
  const keyword = fundName.trim();
  if (!keyword) return null;

  const hits = await searchInstruments(keyword, 8);
  const normalizedKeyword = normalizeFundName(keyword);
  const exact = hits.find((hit) => normalizeFundName(hit.name) === normalizedKeyword);
  if (exact?.symbol) return exact.symbol;

  const contains = hits.find(
    (hit) =>
      hit.kind === 'otc_fund' &&
      (normalizeFundName(hit.name).includes(normalizedKeyword) ||
        normalizedKeyword.includes(normalizeFundName(hit.name))),
  );
  return contains?.symbol ?? hits.find((hit) => hit.kind === 'otc_fund')?.symbol ?? hits[0]?.symbol ?? null;
}

function normalizeFundName(name: string): string {
  return name.replace(/\s+/gu, '').trim();
}
