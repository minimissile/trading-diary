import type { InstrumentInfo, MarketQuote, MarketSearchHit } from '../../../shared/market/types';
import { formatInstrumentSymbol, parseInstrumentInput } from '../../../shared/market/instrument-id';
import type { InstrumentVenue } from '../../../shared/market/venues';
import { MarketNotFoundError } from '../../../shared/market/errors';

interface YahooChartMeta {
  symbol?: string;
  shortName?: string;
  longName?: string;
  currency?: string;
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: YahooChartMeta;
    }>;
    error?: { description?: string } | null;
  };
}

interface YahooSearchQuote {
  symbol?: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;
  exchange?: string;
}

interface YahooSearchResponse {
  quotes?: YahooSearchQuote[];
}

function yahooSymbolFor(ref: { venue: InstrumentVenue; symbol: string }): string {
  if (ref.venue === 'HK') return `${ref.symbol.replace(/^0+/u, '') || ref.symbol}.HK`;
  if (ref.venue === 'US') return ref.symbol;
  return formatInstrumentSymbol(ref);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; TradingDiary/1.0)',
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new MarketNotFoundError(`Yahoo 行情请求失败：${response.status}`);
  }
  return (await response.json()) as T;
}

export async function resolveYahooInstrument(symbolInput: string): Promise<InstrumentInfo> {
  const ref = parseInstrumentInput(symbolInput, { defaultVenue: undefined });
  if (ref.venue !== 'HK' && ref.venue !== 'US') {
    throw new MarketNotFoundError(`Yahoo 不支持该市场：${ref.venue}`);
  }

  const quote = await fetchYahooQuote(ref.venue, ref.symbol);
  return {
    symbol: ref.symbol,
    name: quote.name,
    kind: 'stock',
    market: null,
    venue: ref.venue,
    quoteCurrency: ref.quoteCurrency,
    secid: null,
    f10Code: null,
    securityTypeName: ref.venue === 'HK' ? '港股' : '美股',
    source: 'yahoo',
  };
}

export async function searchYahooInstruments(
  query: string,
  venues: readonly InstrumentVenue[],
  limit = 10,
): Promise<MarketSearchHit[]> {
  const keyword = query.trim();
  if (keyword.length === 0) return [];

  const url = new URL('https://query2.finance.yahoo.com/v1/finance/search');
  url.searchParams.set('q', keyword);
  url.searchParams.set('quotesCount', String(Math.min(Math.max(limit, 1), 20)));
  url.searchParams.set('newsCount', '0');

  const payload = await fetchJson<YahooSearchResponse>(url.toString());
  const hits: MarketSearchHit[] = [];

  for (const row of payload.quotes ?? []) {
    if (!row.symbol) continue;
    let parsed;
    try {
      parsed = parseInstrumentInput(row.symbol);
    } catch {
      continue;
    }
    if (parsed.venue !== 'HK' && parsed.venue !== 'US') continue;
    if (!venues.includes(parsed.venue)) continue;
    hits.push({
      symbol: parsed.symbol,
      name: row.longname ?? row.shortname ?? parsed.symbol,
      securityTypeName: parsed.venue === 'HK' ? '港股' : '美股',
      kind: 'stock',
      venue: parsed.venue,
      quoteCurrency: parsed.quoteCurrency,
      source: 'yahoo',
    });
    if (hits.length >= limit) break;
  }

  return hits;
}

export async function fetchYahooQuote(venue: InstrumentVenue, symbol: string): Promise<MarketQuote> {
  if (venue !== 'HK' && venue !== 'US') {
    throw new MarketNotFoundError(`Yahoo 不支持 venue=${venue}`);
  }

  const ref = { venue, symbol, quoteCurrency: venue === 'HK' ? 'HKD' as const : 'USD' as const };
  const yahooSymbol = yahooSymbolFor(ref);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=1d`;
  const payload = await fetchJson<YahooChartResponse>(url);
  const meta = payload.chart?.result?.[0]?.meta;
  if (!meta) {
    throw new MarketNotFoundError(`未找到标的：${symbol}`);
  }

  const price = meta.regularMarketPrice ?? null;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? null;
  const change = price !== null && prevClose !== null ? price - prevClose : null;
  const changePercent =
    change !== null && prevClose !== null && prevClose !== 0 ? (change / prevClose) * 100 : null;

  return {
    symbol: ref.symbol,
    name: meta.longName ?? meta.shortName ?? ref.symbol,
    kind: 'stock',
    venue: ref.venue,
    quoteCurrency: ref.quoteCurrency,
    price,
    open: null,
    high: null,
    low: null,
    prevClose,
    change,
    changePercent,
    volume: null,
    amount: null,
    peTtm: null,
    pb: null,
    dividendYieldTtm: null,
    nav: null,
    navDate: null,
    estimatedNav: null,
    estimatedNavChangePercent: null,
    source: 'yahoo',
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchYahooQuotes(
  items: Array<{ venue: InstrumentVenue; symbol: string }>,
): Promise<MarketQuote[]> {
  const results = await Promise.all(
    items.map(async (item) => {
      try {
        return await fetchYahooQuote(item.venue, item.symbol);
      } catch {
        return null;
      }
    }),
  );
  return results.filter((item): item is MarketQuote => item !== null);
}
