import type { InstrumentInfo, MarketQuote } from '../../../shared/market/types';
import { MarketNotFoundError } from '../../../shared/market/errors';
import { eastMoneyFetchJson } from './client';
import { EASTMONEY_QUOTE_REFERER, eastMoneyPushUrl } from './endpoints';
import { resolveInstrument } from './search-service';
import {
  asNumber,
  classifyExchangeCode,
  deriveDayMoveFromPercent,
  detectExchangeMarket,
  isPlausiblePrevClose,
  normalizeSymbol,
  scalePrice,
  toF10Code,
  toSecid,
} from './symbols';

interface UlistRow {
  f2?: number;
  f3?: number;
  f9?: number;
  f12?: string;
  f14?: string;
  f23?: number;
  f43?: number;
  f44?: number;
  f45?: number;
  f46?: number;
  f47?: number;
  f48?: number;
  f57?: string;
  f58?: string;
  f60?: number;
  f133?: number;
  f169?: number;
  f170?: number;
}

interface UlistResponse {
  rc: number;
  data?: { diff?: UlistRow[] };
}

interface StockGetResponse {
  data?: UlistRow | null;
}

interface FundMnfInfoRow {
  FCODE: string;
  SHORTNAME: string;
  PDATE?: string;
  NAV?: string;
  NAVCHGRT?: string;
  GSZ?: string | null;
  GSZZL?: string | null;
}

interface FundMnfInfoResponse {
  Success?: boolean;
  Datas?: FundMnfInfoRow[];
}

export async function getQuote(symbolInput: string): Promise<MarketQuote> {
  const instrument = await resolveInstrument(symbolInput);
  if (instrument.kind === 'otc_fund') {
    return fetchOtcFundQuote(instrument);
  }
  return fetchExchangeQuote(instrument);
}

export async function getQuotes(symbols: string[]): Promise<MarketQuote[]> {
  const unique = [...new Set(symbols.map(normalizeSymbol))];
  const exchangeSymbols = unique.filter((symbol) => Boolean(toSecid(symbol)));
  const fundSymbols = unique.filter((symbol) => !toSecid(symbol));

  const [exchangeQuotes, fundQuotes] = await Promise.all([
    fetchExchangeQuotesBatch(exchangeSymbols),
    Promise.all(
      fundSymbols.map(async (symbol) => {
        try {
          return await getQuote(symbol);
        } catch {
          return null;
        }
      }),
    ),
  ]);

  return [...exchangeQuotes, ...fundQuotes.filter((item): item is MarketQuote => item !== null)];
}

function buildExchangeInstrument(symbol: string): InstrumentInfo {
  const market = detectExchangeMarket(symbol);
  const secid = toSecid(symbol);
  if (!market || !secid) {
    throw new MarketNotFoundError(`无法解析行情代码：${symbol}`);
  }

  return {
    symbol,
    name: symbol,
    kind: classifyExchangeCode(symbol),
    market,
    secid,
    f10Code: toF10Code(symbol),
    securityTypeName: null,
    source: 'eastmoney',
  };
}

async function fetchExchangeQuotesBatch(symbols: string[]): Promise<MarketQuote[]> {
  if (symbols.length === 0) return [];

  const secidBySymbol = new Map<string, string>();
  for (const symbol of symbols) {
    const secid = toSecid(symbol);
    if (secid) secidBySymbol.set(symbol, secid);
  }

  const url = eastMoneyPushUrl('/api/qt/ulist.np/get');
  url.searchParams.set('fltt', '2');
  url.searchParams.set(
    'fields',
    'f2,f3,f9,f12,f14,f23,f43,f44,f45,f46,f47,f48,f57,f58,f60,f133,f169,f170',
  );
  url.searchParams.set('secids', [...secidBySymbol.values()].join(','));

  try {
    const payload = await eastMoneyFetchJson<UlistResponse>(url, { referer: EASTMONEY_QUOTE_REFERER });
    const rows = payload.rc === 0 ? (payload.data?.diff ?? []) : [];
    const rowBySymbol = new Map(
      rows
        .map((row) => [normalizeSymbol(row.f12 ?? ''), row] as const)
        .filter(([symbol]) => symbol.length > 0),
    );

    const quotes: MarketQuote[] = [];
    for (const symbol of symbols) {
      const instrument = buildExchangeInstrument(symbol);
      const row = rowBySymbol.get(symbol);
      if (row) {
        quotes.push(mapExchangeQuote(instrument, row));
        continue;
      }

      const secid = secidBySymbol.get(symbol);
      if (!secid) continue;

      try {
        quotes.push(await fetchExchangeQuoteFallback(instrument, secid));
      } catch {
        // 单个标的失败时不影响其它标的
      }
    }
    return quotes;
  } catch {
    const results = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const instrument = buildExchangeInstrument(symbol);
          return await fetchExchangeQuote(instrument);
        } catch {
          return null;
        }
      }),
    );
    return results.filter((item): item is MarketQuote => item !== null);
  }
}

async function fetchExchangeQuote(instrument: InstrumentInfo): Promise<MarketQuote> {
  const secid = instrument.secid ?? toSecid(instrument.symbol);
  if (!secid) throw new MarketNotFoundError(`无法解析行情代码：${instrument.symbol}`);

  const url = eastMoneyPushUrl('/api/qt/ulist.np/get');
  url.searchParams.set('fltt', '2');
  url.searchParams.set(
    'fields',
    'f2,f3,f9,f12,f14,f23,f43,f44,f45,f46,f47,f48,f57,f58,f60,f133,f169,f170',
  );
  url.searchParams.set('secids', secid);

  const payload = await eastMoneyFetchJson<UlistResponse>(url, { referer: EASTMONEY_QUOTE_REFERER });
  const row = payload.rc === 0 ? payload.data?.diff?.[0] : undefined;
  if (!row) {
    return fetchExchangeQuoteFallback(instrument, secid);
  }

  return mapExchangeQuote(instrument, row);
}

async function fetchExchangeQuoteFallback(instrument: InstrumentInfo, secid: string): Promise<MarketQuote> {
  const url = eastMoneyPushUrl('/api/qt/stock/get');
  url.searchParams.set('secid', secid);
  url.searchParams.set('fields', 'f43,f44,f45,f46,f47,f48,f57,f58,f60,f169,f170');

  const payload = await eastMoneyFetchJson<StockGetResponse>(url, { referer: EASTMONEY_QUOTE_REFERER });
  if (!payload.data) throw new MarketNotFoundError(`行情为空：${instrument.symbol}`);

  const row = payload.data;
  const price = scalePrice(row.f43) ?? asNumber(row.f2);
  const changePercentRaw = asNumber(row.f170);
  const changePercent = changePercentRaw !== null ? changePercentRaw / 100 : null;
  return {
    symbol: instrument.symbol,
    name: row.f58 ?? instrument.name,
    kind: instrument.kind,
    price,
    open: scalePrice(row.f46),
    high: scalePrice(row.f44),
    low: scalePrice(row.f45),
    prevClose: scalePrice(row.f60),
    change: scalePrice(row.f169),
    changePercent,
    volume: asNumber(row.f47),
    amount: asNumber(row.f48),
    peTtm: null,
    pb: null,
    dividendYieldTtm: null,
    nav: null,
    navDate: null,
    estimatedNav: null,
    estimatedNavChangePercent: null,
    source: 'eastmoney',
    fetchedAt: new Date().toISOString(),
  };
}

function mapExchangeQuote(instrument: InstrumentInfo, row: UlistRow): MarketQuote {
  const price = asNumber(row.f2) ?? scalePrice(row.f43);
  const changePercent = asNumber(row.f3) ?? (asNumber(row.f170) !== null ? asNumber(row.f170)! / 100 : null);
  let prevClose = scalePrice(row.f60);
  let change = scalePrice(row.f169);

  if (price !== null && changePercent !== null && !isPlausiblePrevClose(prevClose, price)) {
    const derived = deriveDayMoveFromPercent(price, changePercent);
    prevClose = derived.prevClose;
    change = derived.change;
  }

  return {
    symbol: instrument.symbol,
    name: row.f14 ?? instrument.name,
    kind: instrument.kind,
    price,
    open: scalePrice(row.f46),
    high: scalePrice(row.f44),
    low: scalePrice(row.f45),
    prevClose,
    change,
    changePercent,
    volume: asNumber(row.f47),
    amount: asNumber(row.f48),
    peTtm: asNumber(row.f9),
    pb: asNumber(row.f23),
    dividendYieldTtm: asNumber(row.f133),
    nav: null,
    navDate: null,
    estimatedNav: null,
    estimatedNavChangePercent: null,
    source: 'eastmoney',
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchOtcFundQuote(instrument: InstrumentInfo): Promise<MarketQuote> {
  const url = new URL('https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo');
  url.searchParams.set('pageIndex', '1');
  url.searchParams.set('pageSize', '1');
  url.searchParams.set('plat', 'Android');
  url.searchParams.set('appType', 'ttjj');
  url.searchParams.set('product', 'EFund');
  url.searchParams.set('Version', '1');
  url.searchParams.set('deviceid', '1');
  url.searchParams.set('Fcodes', instrument.symbol);

  const payload = await eastMoneyFetchJson<FundMnfInfoResponse>(url, { referer: 'https://fund.eastmoney.com/' });
  const row = payload.Datas?.[0];
  if (!payload.Success || !row) {
    throw new MarketNotFoundError(`场外基金净值不可用：${instrument.symbol}`);
  }

  const nav = asNumber(row.NAV);
  const changePercent = asNumber(row.NAVCHGRT);
  const estimatedNav = asNumber(row.GSZ);
  const estimatedChangePercent = asNumber(row.GSZZL);

  return {
    symbol: instrument.symbol,
    name: row.SHORTNAME ?? instrument.name,
    kind: 'otc_fund',
    price: estimatedNav ?? nav,
    open: null,
    high: null,
    low: null,
    prevClose: nav,
    change: null,
    changePercent: estimatedChangePercent ?? changePercent,
    volume: null,
    amount: null,
    peTtm: null,
    pb: null,
    dividendYieldTtm: null,
    nav,
    navDate: row.PDATE ?? null,
    estimatedNav,
    estimatedNavChangePercent: estimatedChangePercent,
    source: 'eastmoney',
    fetchedAt: new Date().toISOString(),
  };
}

export async function probeExchangeQuote(symbol: string): Promise<boolean> {
  const secid = toSecid(symbol);
  if (!secid) return false;

  const url = eastMoneyPushUrl('/api/qt/ulist.np/get');
  url.searchParams.set('fltt', '2');
  url.searchParams.set('fields', 'f12,f14');
  url.searchParams.set('secids', secid);

  const payload = await eastMoneyFetchJson<UlistResponse>(url, { referer: EASTMONEY_QUOTE_REFERER });
  return payload.rc === 0 && Boolean(payload.data?.diff?.[0]?.f12);
}
