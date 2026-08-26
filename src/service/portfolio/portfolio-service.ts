import type {
  CreatePortfolioLedgerInput,
  DividendCalendarDay,
  DividendRecordStatus,
  PortfolioDividendRecord,
  PortfolioPositionView,
  PortfolioRefreshResult,
  PortfolioSummaryView,
} from '../../shared/portfolio/types';
import type { AppDatabase } from '../database/database';
import { marketService } from '../market/market-service';
import { buildProjectedDividends, matchDividendEvent } from './dividend-matcher';
import {
  buildDividendCalendar,
  buildPortfolioSummary,
  computeExpectedFromEvents,
  computeYtdReceived,
} from './dividend-stats';
import { aggregatePositions } from './ledger-service';

export class PortfolioService {
  private lastRefreshedAt: string | null = null;

  constructor(private readonly database: AppDatabase) {}

  async listPositions(accountId?: string): Promise<PortfolioPositionView[]> {
    const portfolio = this.database.portfolio;
    const resolvedAccountId = portfolio.resolveAccountId(accountId);
    const ledger = portfolio.listLedger(resolvedAccountId);
    const aggregates = aggregatePositions(ledger);
    if (aggregates.length === 0) return [];

    const symbols = aggregates.map((item) => item.symbol);
    const quotes = await marketService.getQuotes(symbols);
    const quoteMap = new Map(quotes.map((quote) => [quote.symbol, quote]));
    const dividends = portfolio.listDividends(resolvedAccountId);
    const year = new Date().getFullYear();

    const upcomingBySymbol = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const result = await marketService.listDividends(symbol, 1, 20);
          return { symbol, items: result.items };
        } catch {
          return { symbol, items: [] };
        }
      }),
    );
    const allUpcoming = upcomingBySymbol.flatMap((item) => item.items);

    return aggregates.map((position) => {
      const quote = quoteMap.get(position.symbol);
      const marketPrice = quote?.price ?? quote?.nav ?? null;
      const marketValue = marketPrice === null ? null : marketPrice * position.quantity;
      const cost = position.avgCost * position.quantity;
      const symbolDividends = dividends.filter((record) => record.symbol === position.symbol);
      const ytd = computeYtdReceived(symbolDividends, year);
      const holdings = new Map([[position.symbol, position.quantity]]);
      const expected = computeExpectedFromEvents(holdings, allUpcoming);

      return {
        symbol: position.symbol,
        name: quote?.name ?? position.symbol,
        kind: position.kind,
        quantity: position.quantity,
        avgCost: position.avgCost,
        marketPrice,
        marketValue,
        unrealizedPnl: marketValue === null ? null : marketValue - cost,
        firstBuyAt: position.firstBuyAt,
        ytdDividendReceived: ytd,
        expectedDividend: expected,
        dividendYieldTtm: quote?.dividendYieldTtm ?? null,
      };
    });
  }

  async getSummary(accountId?: string, year = new Date().getFullYear()): Promise<PortfolioSummaryView> {
    const positions = await this.listPositions(accountId);
    const portfolio = this.database.portfolio;
    const resolvedAccountId = portfolio.resolveAccountId(accountId);
    const records = portfolio.listDividends(resolvedAccountId, year);
    const expectedDividend = positions.reduce((sum, item) => sum + item.expectedDividend, 0);
    const totalMarketValue = positions.reduce((sum, item) => sum + (item.marketValue ?? 0), 0);
    const totalCost = positions.reduce((sum, item) => sum + item.avgCost * item.quantity, 0);

    return buildPortfolioSummary({
      year,
      records,
      expectedDividend,
      totalMarketValue,
      totalCost,
      lastRefreshedAt: this.lastRefreshedAt,
    });
  }

  async getDividendCalendar(accountId: string | undefined, month: string): Promise<DividendCalendarDay[]> {
    const portfolio = this.database.portfolio;
    const resolvedAccountId = portfolio.resolveAccountId(accountId);
    const records = await this.enrichDividendNames(portfolio.listDividends(resolvedAccountId));
    const positions = await this.listPositions(resolvedAccountId);
    const holdings = new Map(
      positions.map((item) => [item.symbol, { quantity: item.quantity, kind: item.kind, name: item.name }]),
    );

    const eventsNested = await Promise.all(
      [...holdings.keys()].map(async (symbol) => {
        try {
          const result = await marketService.listDividends(symbol, 1, 30);
          return result.items;
        } catch {
          return [];
        }
      }),
    );
    const projected = buildProjectedDividends(holdings, eventsNested.flat());

    return buildDividendCalendar(records, month, projected);
  }

  async listDividends(
    accountId?: string,
    year?: number,
    statuses?: DividendRecordStatus[],
  ): Promise<PortfolioDividendRecord[]> {
    const records = this.database.portfolio.listDividends(accountId, year, statuses);
    return this.enrichDividendNames(records);
  }

  async addLedgerEntry(input: CreatePortfolioLedgerInput): Promise<PortfolioPositionView[]> {
    let payload = input;
    if (!payload.kind) {
      const instrument = await marketService.resolve(payload.symbol);
      payload = { ...payload, kind: instrument.kind, symbol: instrument.symbol };
    }
    this.database.portfolio.addLedgerEntry(payload);
    return this.listPositions(payload.accountId);
  }

  async confirmDividend(
    id: string,
    confirmed: boolean,
    cashAmount?: number,
  ): Promise<PortfolioDividendRecord[]> {
    const status = confirmed ? 'confirmed' : 'rejected';
    const cents = cashAmount === undefined ? undefined : Math.round(cashAmount * 100);
    this.database.portfolio.setDividendStatus(id, status, cents);
    return this.listDividends();
  }

  async refreshDividends(accountId?: string, symbol?: string): Promise<PortfolioRefreshResult> {
    const portfolio = this.database.portfolio;
    const resolvedAccountId = portfolio.resolveAccountId(accountId);
    const ledger = portfolio.listLedger(resolvedAccountId);
    const aggregates = aggregatePositions(ledger);
    const targets = symbol
      ? aggregates.filter((item) => item.symbol === symbol.trim().toUpperCase())
      : aggregates;

    const today = new Date().toISOString().slice(0, 10);
    const autoCutoff = shiftDate(today, -3);
    portfolio.autoConfirmPastDividends(resolvedAccountId, autoCutoff);

    let synced = 0;
    let estimated = 0;

    for (const position of targets) {
      const symbolLedger = ledger.filter((entry) => entry.symbol === position.symbol);
      let page = 1;
      let totalPages = 1;

      while (page <= totalPages) {
        const result = await marketService.listDividends(position.symbol, page, 50);
        totalPages = Math.max(1, Math.ceil(result.total / 50));

        for (const event of result.items) {
          const match = matchDividendEvent({
            accountId: resolvedAccountId,
            symbol: position.symbol,
            kind: position.kind,
            ledger: symbolLedger,
            event,
            today,
          });
          if (!match.upsert) continue;
          if (match.upsert.exDividendDate.slice(0, 4) !== String(new Date().getFullYear())) continue;

          portfolio.upsertDividend(match.upsert);
          synced += 1;
          if (match.upsert.status === 'estimated') estimated += 1;
        }

        page += 1;
        if (result.items.length === 0) break;
      }
    }

    this.lastRefreshedAt = new Date().toISOString();
    return { synced, estimated };
  }

  async syncMarketQuotes(accountId?: string): Promise<PortfolioPositionView[]> {
    this.lastRefreshedAt = new Date().toISOString();
    return this.listPositions(accountId);
  }

  private async enrichDividendNames(records: PortfolioDividendRecord[]): Promise<PortfolioDividendRecord[]> {
    const symbols = [...new Set(records.map((record) => record.symbol))];
    if (symbols.length === 0) return records;

    const quotes = await marketService.getQuotes(symbols);
    const nameMap = new Map(quotes.map((quote) => [quote.symbol, quote.name]));

    return records.map((record) => ({
      ...record,
      name: nameMap.get(record.symbol) ?? record.symbol,
    }));
  }
}

function shiftDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function createPortfolioService(database: AppDatabase): PortfolioService {
  return new PortfolioService(database);
}
