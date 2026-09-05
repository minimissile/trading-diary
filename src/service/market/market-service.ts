import type {
  DividendListResult,
  KLineAdjust,
  KLineListResult,
  KLinePeriod,
  MarketNewsItem,
  MarketQuote,
  MarketSearchHit,
  MarketSnapshot,
} from '../../shared/market/types';
import type { InstrumentVenue } from '../../shared/market/venues';
import { computeOtcFundDividendYield, listDividends, listUpcomingDividends } from './eastmoney/dividend-service';
import { lookupHistoricalPriceOnDate as fetchHistoricalPriceOnDate } from './eastmoney/historical-price-service';
import { listKlines as fetchKlines } from './eastmoney/kline-service';
import { listNews } from './eastmoney/news-service';
import {
  getQuoteMulti,
  getQuotesMulti,
  resolveInstrumentMulti,
  searchInstrumentsMulti,
} from './market-router';

export interface MarketSnapshotExtended extends MarketSnapshot {
  upcomingDividends: Awaited<ReturnType<typeof listUpcomingDividends>>;
}

export class MarketService {
  resolve(symbol: string) {
    return resolveInstrumentMulti(symbol);
  }

  search(query: string, limit?: number, marketScopes?: readonly string[], assetKind?: 'stock' | 'fund'): Promise<MarketSearchHit[]> {
    return searchInstrumentsMulti(query, marketScopes ?? ['CN_A'], limit, assetKind);
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    const quote = await getQuoteMulti(symbol);
    if (!quote.dividendYieldTtm || quote.dividendYieldTtm <= 0) {
      if (quote.venue === 'SH' || quote.venue === 'SZ' || quote.venue === 'OTC') {
        const computed = await computeOtcFundDividendYield(quote.symbol, quote.price ?? quote.nav);
        if (computed !== null) {
          quote.dividendYieldTtm = computed;
        }
      }
    }
    return quote;
  }

  getQuotes(items: Array<{ symbol: string; venue?: InstrumentVenue }>): Promise<MarketQuote[]> {
    return getQuotesMulti(items);
  }

  /** @deprecated 请使用 getQuotes([{ symbol, venue }]) */
  getQuotesBySymbols(symbols: string[]): Promise<MarketQuote[]> {
    return getQuotesMulti(symbols.map((symbol) => ({ symbol })));
  }

  async getSnapshot(symbol: string): Promise<MarketSnapshotExtended> {
    const instrument = await resolveInstrumentMulti(symbol);
    const quote = await this.getQuote(symbol);
    const upcomingDividends =
      instrument.venue === 'HK' || instrument.venue === 'US'
        ? []
        : await listUpcomingDividends(symbol, 5).catch(() => []);
    return { instrument, quote, upcomingDividends };
  }

  listDividends(symbol: string, page?: number, pageSize?: number): Promise<DividendListResult> {
    return listDividends(symbol, page, pageSize);
  }

  listNews(symbol: string, pageSize?: number): Promise<MarketNewsItem[]> {
    return listNews(symbol, pageSize);
  }

  listKlines(
    symbol: string,
    period?: KLinePeriod,
    adjust?: KLineAdjust,
    limit?: number,
    beforeTimestamp?: number,
  ): Promise<KLineListResult> {
    return fetchKlines(symbol, period, adjust, limit, beforeTimestamp);
  }

  lookupHistoricalPriceOnDate(symbol: string, dateKey: string) {
    return fetchHistoricalPriceOnDate(symbol, dateKey);
  }
}

export const marketService = new MarketService();
