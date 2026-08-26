import type { InstrumentInfo, MarketQuote } from '../../../shared/market/types';
import { MarketNotFoundError } from '../../../shared/market/errors';
import { eastMoneyFetchJson } from './client';
import { resolveInstrument } from './search-service';
import { asNumber, normalizeSymbol, scalePrice, toSecid } from './symbols';

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
  const results = await Promise.all(
    unique.map(async (symbol) => {
      try {
        return await getQuote(symbol);
      } catch {
        return null;
      }
    }),
  );
  return results.filter((item): item is MarketQuote => item !== null);
}

async function fetchExchangeQuote(instrument: InstrumentInfo): Promise<MarketQuote> {
  const secid = instrument.secid ?? toSecid(instrument.symbol);
  if (!secid) throw new MarketNotFoundError(`无法解析行情代码：${instrument.symbol}`);

  const url = new URL('https://push2.eastmoney.com/api/qt/ulist.np/get');
  url.searchParams.set('fltt', '2');
  url.searchParams.set(
    'fields',
    'f2,f3,f9,f12,f14,f23,f43,f44,f45,f46,f47,f48,f57,f58,f60,f133,f169,f170',
  );
  url.searchParams.set('secids', secid);

  const payload = await eastMoneyFetchJson<UlistResponse>(url, { referer: 'https://quote.eastmoney.com/' });
  const row = payload.rc === 0 ? payload.data?.diff?.[0] : undefined;
  if (!row) {
    return fetchExchangeQuoteFallback(instrument, secid);
  }

  return mapExchangeQuote(instrument, row);
}

async function fetchExchangeQuoteFallback(instrument: InstrumentInfo, secid: string): Promise<MarketQuote> {
  const url = new URL('https://push2.eastmoney.com/api/qt/stock/get');
  url.searchParams.set('secid', secid);
  url.searchParams.set('fields', 'f43,f44,f45,f46,f47,f48,f57,f58,f60,f169,f170');

  const payload = await eastMoneyFetchJson<StockGetResponse>(url, { referer: 'https://quote.eastmoney.com/' });
  if (!payload.data) throw new MarketNotFoundError(`行情为空：${instrument.symbol}`);

  const row = payload.data;
  return {
    symbol: instrument.symbol,
    name: row.f58 ?? instrument.name,
    kind: instrument.kind,
    price: scalePrice(row.f43) ?? asNumber(row.f2),
    open: scalePrice(row.f46),
    high: scalePrice(row.f44),
    low: scalePrice(row.f45),
    prevClose: scalePrice(row.f60),
    change: scalePrice(row.f169),
    changePercent: asNumber(row.f170),
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
  return {
    symbol: row.f12 ?? instrument.symbol,
    name: row.f14 ?? instrument.name,
    kind: instrument.kind,
    price: asNumber(row.f2) ?? scalePrice(row.f43),
    open: scalePrice(row.f46),
    high: scalePrice(row.f44),
    low: scalePrice(row.f45),
    prevClose: scalePrice(row.f60),
    change: scalePrice(row.f169),
    changePercent: asNumber(row.f3) ?? asNumber(row.f170),
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

  const url = new URL('https://push2.eastmoney.com/api/qt/ulist.np/get');
  url.searchParams.set('fltt', '2');
  url.searchParams.set('fields', 'f12,f14');
  url.searchParams.set('secids', secid);

  const payload = await eastMoneyFetchJson<UlistResponse>(url, { referer: 'https://quote.eastmoney.com/' });
  return payload.rc === 0 && Boolean(payload.data?.diff?.[0]?.f12);
}
