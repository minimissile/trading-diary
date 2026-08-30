import type { InstrumentInfo, MarketQuote, MarketSearchHit } from '../../../shared/market/types';
import { parseInstrumentInput, instrumentPositionKey } from '../../shared/market/instrument-id';
import type { InstrumentVenue } from '../../shared/market/venues';
import { resolveInstrument, resolveEastMoneyByVenue, searchInstrumentsScoped } from './eastmoney/search-service';
import { enrichEastMoneyInstrument, enrichEastMoneyQuote } from './eastmoney/enrich';
import {
  fetchYahooQuote,
  fetchYahooQuotes,
  resolveYahooInstrument,
  searchYahooInstruments,
} from './yahoo/quote-service';
import { detectExchangeMarket, normalizeSymbol } from './eastmoney/symbols';

function isOffshoreVenue(venue: InstrumentVenue): venue is Extract<InstrumentVenue, 'HK' | 'US'> {
  return venue === 'HK' || venue === 'US';
}

function tryParseInput(raw: string): ReturnType<typeof parseInstrumentInput> | null {
  try {
    return parseInstrumentInput(raw);
  } catch {
    return null;
  }
}

async function resolveOffshoreInstrument(
  venue: Extract<InstrumentVenue, 'HK' | 'US'>,
  symbol: string,
  raw: string,
): Promise<InstrumentInfo> {
  try {
    return await resolveEastMoneyByVenue(venue, symbol);
  } catch {
    return resolveYahooInstrument(raw);
  }
}

async function fetchOffshoreQuote(
  venue: Extract<InstrumentVenue, 'HK' | 'US'>,
  symbol: string,
): Promise<MarketQuote> {
  try {
    const { getQuoteByVenue } = await import('./eastmoney/quote-service');
    return await getQuoteByVenue(venue, symbol);
  } catch {
    return fetchYahooQuote(venue, symbol);
  }
}

export async function resolveInstrumentMulti(raw: string): Promise<InstrumentInfo> {
  const parsed = tryParseInput(raw);
  if (parsed && isOffshoreVenue(parsed.venue)) {
    return resolveOffshoreInstrument(parsed.venue, parsed.symbol, raw);
  }

  const info = await resolveInstrument(raw);
  return enrichEastMoneyInstrument(info);
}

export async function searchInstrumentsMulti(
  query: string,
  scopes: readonly string[],
  limit = 10,
): Promise<MarketSearchHit[]> {
  const includeCn = scopes.includes('CN_A');
  const includeHk = scopes.includes('HK');
  const includeUs = scopes.includes('US');
  const perSource = Math.max(3, Math.ceil(limit / 2));

  const tasks: Array<Promise<MarketSearchHit[]>> = [];

  if (includeCn || includeHk || includeUs) {
    tasks.push(searchInstrumentsScoped(query, scopes, perSource));
  }

  const yahooVenues: InstrumentVenue[] = [];
  if (includeHk) yahooVenues.push('HK');
  if (includeUs) yahooVenues.push('US');
  if (yahooVenues.length > 0) {
    tasks.push(searchYahooInstruments(query, yahooVenues, perSource));
  }

  const groups = await Promise.all(tasks);
  const merged: MarketSearchHit[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    for (const hit of group) {
      const key = instrumentPositionKey({ venue: hit.venue, symbol: hit.symbol });
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(hit);
      if (merged.length >= limit) return merged;
    }
  }

  return merged;
}

export async function getQuoteMulti(raw: string): Promise<MarketQuote> {
  const parsed = tryParseInput(raw);
  if (parsed && isOffshoreVenue(parsed.venue)) {
    return fetchOffshoreQuote(parsed.venue, parsed.symbol);
  }

  const symbol = normalizeSymbol(raw);
  const { getQuote } = await import('./eastmoney/quote-service');
  const quote = await getQuote(symbol);
  const market = detectExchangeMarket(symbol);
  const venue: InstrumentVenue = quote.kind === 'otc_fund' ? 'OTC' : market ?? 'SH';
  return enrichEastMoneyQuote(quote, venue);
}

export async function getQuotesMulti(
  items: Array<{ symbol: string; venue?: InstrumentVenue }>,
): Promise<MarketQuote[]> {
  const cnSymbols: string[] = [];
  const otcSymbols: string[] = [];
  const offshoreItems: Array<{ venue: Extract<InstrumentVenue, 'HK' | 'US'>; symbol: string }> = [];
  const yahooFallbackItems: Array<{ venue: Extract<InstrumentVenue, 'HK' | 'US'>; symbol: string }> = [];

  for (const item of items) {
    const parsed = item.venue
      ? { venue: item.venue, symbol: normalizeSymbol(item.symbol) }
      : tryParseInput(item.symbol);
    if (!parsed) {
      cnSymbols.push(normalizeSymbol(item.symbol));
      continue;
    }
    if (parsed.venue === 'OTC') {
      otcSymbols.push(parsed.symbol);
    } else if (isOffshoreVenue(parsed.venue)) {
      offshoreItems.push({ venue: parsed.venue, symbol: parsed.symbol });
    } else {
      cnSymbols.push(parsed.symbol);
    }
  }

  const [cnQuotes, otcQuotes, offshoreQuotes] = await Promise.all([
    cnSymbols.length > 0
      ? import('./eastmoney/quote-service').then((mod) => mod.getQuotes(cnSymbols))
      : Promise.resolve([]),
    Promise.all(
      otcSymbols.map(async (symbol) => {
        try {
          const { getQuote } = await import('./eastmoney/quote-service');
          return await getQuote(symbol);
        } catch {
          return null;
        }
      }),
    ).then((quotes) => quotes.filter((item): item is MarketQuote => item !== null)),
    offshoreItems.length > 0
      ? import('./eastmoney/quote-service')
          .then((mod) => mod.getQuotesByVenue(offshoreItems))
          .catch(() => [] as MarketQuote[])
      : Promise.resolve([]),
  ]);

  const offshoreByKey = new Map(
    offshoreQuotes.map((quote) => [instrumentPositionKey({ venue: quote.venue, symbol: quote.symbol }), quote]),
  );

  for (const item of offshoreItems) {
    const key = instrumentPositionKey(item);
    if (!offshoreByKey.has(key)) {
      yahooFallbackItems.push(item);
    }
  }

  const yahooQuotes =
    yahooFallbackItems.length > 0 ? await fetchYahooQuotes(yahooFallbackItems) : [];

  const enrichedCn = cnQuotes.map((quote) => {
    const market = detectExchangeMarket(quote.symbol);
    const venue: InstrumentVenue = quote.kind === 'otc_fund' ? 'OTC' : market ?? 'SH';
    return enrichEastMoneyQuote(quote, venue);
  });

  return [...enrichedCn, ...otcQuotes, ...offshoreQuotes, ...yahooQuotes];
}
