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
import { computeOtcFundDividendYield, listDividends, listUpcomingDividends } from './eastmoney/dividend-service';
import { lookupHistoricalPriceOnDate as fetchHistoricalPriceOnDate } from './eastmoney/historical-price-service';
import { listKlines as fetchKlines } from './eastmoney/kline-service';
import { listNews } from './eastmoney/news-service';
import { getQuote as fetchQuote, getQuotes as fetchQuotes } from './eastmoney/quote-service';
import { resolveInstrument, searchInstruments } from './eastmoney/search-service';

export interface MarketSnapshotExtended extends MarketSnapshot {
  upcomingDividends: Awaited<ReturnType<typeof listUpcomingDividends>>;
}

export class MarketService {
  resolve(symbol: string) {
    return resolveInstrument(symbol);
  }

  search(query: string, limit?: number): Promise<MarketSearchHit[]> {
    return searchInstruments(query, limit);
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    const quote = await fetchQuote(symbol);
    if (!quote.dividendYieldTtm || quote.dividendYieldTtm <= 0) {
      const computed = await computeOtcFundDividendYield(quote.symbol, quote.price ?? quote.nav);
      if (computed !== null) {
        quote.dividendYieldTtm = computed;
      }
    }
    return quote;
  }

  getQuotes(symbols: string[]): Promise<MarketQuote[]> {
    return fetchQuotes(symbols);
  }

  async getSnapshot(symbol: string): Promise<MarketSnapshotExtended> {
    const instrument = await resolveInstrument(symbol);
    const quote = await this.getQuote(symbol);
    const upcomingDividends = await listUpcomingDividends(symbol, 5).catch(() => []);
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
  ): Promise<KLineListResult> {
    return fetchKlines(symbol, period, adjust, limit);
  }

  lookupHistoricalPriceOnDate(symbol: string, dateKey: string) {
    return fetchHistoricalPriceOnDate(symbol, dateKey);
  }
}

export const marketService = new MarketService();
