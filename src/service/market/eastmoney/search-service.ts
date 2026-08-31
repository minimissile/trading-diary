import type { InstrumentInfo, InstrumentKind, MarketSearchHit } from '../../../shared/market/types';
import { MarketNotFoundError } from '../../../shared/market/errors';
import type { InstrumentVenue } from '../../../shared/market/venues';
import { isVenueAllowedByScopes, marketScopeForVenue } from '../../../shared/market/venues';
import { eastMoneyFetchJson } from './client';
import { EASTMONEY_QUOTE_REFERER, eastMoneyPushUrl } from './endpoints';
import { enrichEastMoneyInstrument, enrichEastMoneySearchHit } from './enrich';
import {
  classifyExchangeCode,
  detectExchangeMarket,
  isSearchableCodeTableRow,
  mapSecurityTypeName,
  normalizeHongKongSymbol,
  normalizeSymbol,
  toF10Code,
  toSecid,
  toSecidForVenue,
  venueFromCodeTableRow,
} from './symbols';

interface CodeTableHit {
  code: string;
  shortName: string;
  securityTypeName?: string;
  market?: number;
  smallType?: number;
}

interface CodeTableResponse {
  result?: CodeTableHit[];
}

interface FundSuggestHit {
  CODE: string;
  NAME: string;
  CATEGORYDESC?: string;
}

interface FundSuggestResponse {
  Datas?: FundSuggestHit[];
}

interface UlistResponse {
  rc: number;
  data?: { diff?: Array<{ f12?: string; f14?: string }> };
}

function scoreSearchHit(keyword: string, hit: MarketSearchHit): number {
  let score = 0;
  if (hit.symbol === keyword) score += 100;
  else if (hit.symbol.startsWith(keyword)) score += 40;
  else if (keyword.startsWith(hit.symbol)) score += 30;
  if (hit.kind === 'otc_fund') score += 15;
  if (hit.name.toUpperCase().includes(keyword)) score += 5;
  return score;
}

function mergeAndRankSearchHits(keyword: string, hits: MarketSearchHit[], limit: number): MarketSearchHit[] {
  const normalizedKeyword = normalizeSymbol(keyword);
  const seen = new Set<string>();
  const unique: MarketSearchHit[] = [];
  for (const hit of hits) {
    const key = `${hit.venue}:${hit.symbol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(hit);
  }
  unique.sort((a, b) => scoreSearchHit(normalizedKeyword, b) - scoreSearchHit(normalizedKeyword, a));
  return unique.slice(0, limit);
}

async function searchOtcFundHits(keyword: string, limit: number): Promise<MarketSearchHit[]> {
  const fundUrl = new URL('https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx');
  fundUrl.searchParams.set('m', '1');
  fundUrl.searchParams.set('key', keyword);
  fundUrl.searchParams.set('_', String(Date.now()));

  const fundPayload = await eastMoneyFetchJson<FundSuggestResponse>(fundUrl, {
    referer: 'https://fund.eastmoney.com/',
  });

  return (fundPayload.Datas ?? []).slice(0, limit).map((row) =>
    enrichEastMoneySearchHit(
      {
        symbol: normalizeSymbol(row.CODE),
        name: row.NAME,
        securityTypeName: row.CATEGORYDESC ?? '基金',
        kind: 'otc_fund' as const,
        source: 'eastmoney',
      },
      'OTC',
    ),
  );
}

export async function searchInstruments(query: string, limit = 10): Promise<MarketSearchHit[]> {
  return searchInstrumentsScoped(query, ['CN_A'], limit);
}

export async function searchInstrumentsScoped(
  query: string,
  scopes: readonly string[],
  limit = 10,
): Promise<MarketSearchHit[]> {
  const keyword = query.trim();
  if (keyword.length === 0) return [];

  const url = new URL('https://search-codetable.eastmoney.com/codetable/search/web');
  url.searchParams.set('client', 'web');
  url.searchParams.set('clientType', 'webSuggest');
  url.searchParams.set('clientVersion', 'lastest');
  url.searchParams.set('keyword', keyword);
  url.searchParams.set('pageIndex', '1');
  url.searchParams.set('pageSize', String(Math.min(Math.max(limit, 1), 20)));

  const payload = await eastMoneyFetchJson<CodeTableHit[] | CodeTableResponse>(url);
  const rows = Array.isArray(payload) ? payload : (payload.result ?? []);

  const hits: MarketSearchHit[] = [];
  for (const row of rows) {
    if (!isSearchableCodeTableRow(row)) continue;
    const venue = venueFromCodeTableRow(row);
    if (!venue || !isVenueAllowedByScopes(scopes, venue)) continue;

    const symbol =
      venue === 'HK'
        ? normalizeHongKongSymbol(row.code)
        : venue === 'US'
          ? normalizeSymbol(row.code)
          : normalizeSymbol(row.code);
    const mapped = mapSecurityTypeName(row.securityTypeName);
    const kind =
      venue === 'HK' || venue === 'US'
        ? 'stock'
        : mapped === 'unknown'
          ? await inferKindFromQuote(symbol, row.securityTypeName)
          : mapped;
    hits.push(
      enrichEastMoneySearchHit(
        {
          symbol,
          name: row.shortName,
          securityTypeName: row.securityTypeName ?? null,
          kind,
          source: 'eastmoney',
        },
        venue,
      ),
    );
    if (hits.length >= limit) break;
  }

  if (!scopes.includes('CN_A')) return hits;

  try {
    const fundHits = await searchOtcFundHits(keyword, limit);
    return mergeAndRankSearchHits(keyword, [...hits, ...fundHits], limit);
  } catch {
    return hits;
  }
}

export async function resolveInstrument(symbolInput: string): Promise<InstrumentInfo> {
  const symbol = normalizeSymbol(symbolInput);
  const market = detectExchangeMarket(symbol);
  const secid = toSecid(symbol);
  const f10Code = toF10Code(symbol);

  let name = symbol;
  let securityTypeName: string | null = null;
  let searchHits: MarketSearchHit[] = [];

  try {
    searchHits = await searchInstruments(symbol, 5);
    const exact = searchHits.find((hit) => hit.symbol === symbol);
    if (exact) {
      name = exact.name;
      securityTypeName = exact.securityTypeName;
    }
  } catch {
    // 搜索接口失败时不阻断后续 secid / 基金解析
  }

  const fundInfo = await fetchFundName(symbol);
  const exactHit = searchHits.find((hit) => hit.symbol === symbol);
  const stockHit = searchHits.find((hit) => hit.symbol === symbol && hit.kind === 'stock');
  const markedAsFund =
    exactHit?.kind === 'otc_fund' || /基金/u.test(exactHit?.securityTypeName ?? securityTypeName ?? '');

  if (fundInfo) {
    const exchangeKind = secid ? classifyExchangeCode(symbol) : null;
    let exchangeListed: { name: string } | null = null;
    if (secid) {
      try {
        exchangeListed = await fetchExchangeName(secid);
      } catch {
        exchangeListed = null;
      }
    }

    if (exchangeKind === 'lof' || exchangeKind === 'etf') {
      return enrichEastMoneyInstrument({
        symbol,
        name: exchangeListed?.name ?? fundInfo.name,
        kind: exchangeKind,
        market,
        secid,
        f10Code,
        securityTypeName: securityTypeName ?? (exchangeKind === 'lof' ? 'LOF' : 'ETF'),
        source: 'eastmoney',
      });
    }

    if (!exchangeListed) {
      const looksLikeCnStock = Boolean(secid && market && exchangeKind === 'stock');
      if (!looksLikeCnStock || (markedAsFund && !stockHit)) {
        return enrichEastMoneyInstrument({
          symbol,
          name: fundInfo.name,
          kind: 'otc_fund',
          market: null,
          secid: null,
          f10Code: null,
          securityTypeName: securityTypeName ?? '场外基金',
          source: 'eastmoney',
        });
      }
    }
  }

  if (markedAsFund && fundInfo && !stockHit) {
    const exchangeKind = secid ? classifyExchangeCode(symbol) : null;
    const kind = exchangeKind === 'lof' || exchangeKind === 'etf' ? exchangeKind : 'otc_fund';
    return enrichEastMoneyInstrument({
      symbol,
      name: fundInfo.name,
      kind,
      market: kind === 'otc_fund' ? null : market,
      secid: kind === 'otc_fund' ? null : secid,
      f10Code: kind === 'otc_fund' ? null : f10Code,
      securityTypeName: securityTypeName ?? '场外基金',
      source: 'eastmoney',
    });
  }

  if (secid && market) {
    try {
      const exchangeQuote = await fetchExchangeName(secid);
      if (exchangeQuote) {
        name = exchangeQuote.name;
      }
    } catch {
      // 行情接口失败时仍返回可识别的交易所标的
    }

    const exchangeKind = classifyExchangeCode(symbol);
    if (fundInfo && exchangeKind === 'stock' && !stockHit && exactHit?.kind !== 'stock') {
      return enrichEastMoneyInstrument({
        symbol,
        name: fundInfo.name,
        kind: 'otc_fund',
        market: null,
        secid: null,
        f10Code: null,
        securityTypeName: securityTypeName ?? '场外基金',
        source: 'eastmoney',
      });
    }

    return enrichEastMoneyInstrument({
      symbol,
      name,
      kind: exchangeKind,
      market,
      secid,
      f10Code,
      securityTypeName,
      source: 'eastmoney',
    });
  }

  if (fundInfo) {
    return enrichEastMoneyInstrument({
      symbol,
      name: fundInfo.name,
      kind: 'otc_fund',
      market: null,
      secid: null,
      f10Code: null,
      securityTypeName: securityTypeName ?? '场外基金',
      source: 'eastmoney',
    });
  }

  throw new MarketNotFoundError(`未找到标的：${symbol}`);
}

/** 按上市地解析港美股标的（EastMoney）。 */
export async function resolveEastMoneyByVenue(
  venue: Extract<InstrumentVenue, 'HK' | 'US'>,
  symbolInput: string,
): Promise<InstrumentInfo> {
  const symbol = venue === 'HK' ? normalizeHongKongSymbol(symbolInput) : normalizeSymbol(symbolInput);
  const secid = toSecidForVenue(symbol, venue);
  if (!secid) throw new MarketNotFoundError(`无法解析行情代码：${symbol}`);

  let name = symbol;
  let securityTypeName: string | null = venue === 'HK' ? '港股' : '美股';

  try {
    const hits = await searchInstrumentsScoped(symbol, [marketScopeForVenue(venue)], 5);
    const exact = hits.find((hit) => hit.symbol === symbol && hit.venue === venue);
    if (exact) {
      name = exact.name;
      securityTypeName = exact.securityTypeName;
    }
  } catch {
    // 搜索失败时继续走行情接口
  }

  try {
    const exchangeQuote = await fetchExchangeName(secid);
    if (exchangeQuote) name = exchangeQuote.name;
  } catch {
    // 行情接口失败时仍返回可识别标的
  }

  return enrichEastMoneyInstrument(
    {
      symbol,
      name,
      kind: 'stock',
      market: null,
      secid,
      f10Code: null,
      securityTypeName,
      source: 'eastmoney',
    },
    venue,
  );
}

async function inferKindFromQuote(symbol: string, securityTypeName?: string): Promise<InstrumentKind> {
  if (/基金/u.test(securityTypeName ?? '')) {
    const exchangeKind = classifyExchangeCode(normalizeSymbol(symbol));
    if (exchangeKind === 'lof' || exchangeKind === 'etf') return exchangeKind;
    return 'otc_fund';
  }

  const secid = toSecid(symbol);
  if (secid && (await fetchExchangeName(secid))) {
    return classifyExchangeCode(symbol);
  }
  return 'otc_fund';
}

async function fetchExchangeName(secid: string): Promise<{ name: string } | null> {
  const url = eastMoneyPushUrl('/api/qt/ulist.np/get');
  url.searchParams.set('fltt', '2');
  url.searchParams.set('fields', 'f12,f14');
  url.searchParams.set('secids', secid);

  const payload = await eastMoneyFetchJson<UlistResponse>(url, { referer: EASTMONEY_QUOTE_REFERER });
  if (payload.rc !== 0 || !payload.data?.diff?.[0]?.f14) return null;
  return { name: payload.data.diff[0].f14 };
}

interface FundMnfInfoRow {
  FCODE: string;
  SHORTNAME: string;
}

interface FundMnfInfoResponse {
  Success?: boolean;
  Datas?: FundMnfInfoRow[];
}

async function fetchFundName(symbol: string): Promise<{ name: string } | null> {
  const url = new URL('https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo');
  url.searchParams.set('pageIndex', '1');
  url.searchParams.set('pageSize', '1');
  url.searchParams.set('plat', 'Android');
  url.searchParams.set('appType', 'ttjj');
  url.searchParams.set('product', 'EFund');
  url.searchParams.set('Version', '1');
  url.searchParams.set('deviceid', '1');
  url.searchParams.set('Fcodes', symbol);

  const payload = await eastMoneyFetchJson<FundMnfInfoResponse>(url, { referer: 'https://fund.eastmoney.com/' });
  const row = payload.Datas?.[0];
  if (!payload.Success || !row?.SHORTNAME) return null;
  return { name: row.SHORTNAME };
}
