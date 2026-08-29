import type {
  CreatePortfolioLedgerInput,
  DividendCalendarDay,
  DividendRecordStatus,
  PortfolioDividendRecord,
  PortfolioLedgerEntry,
  PortfolioPositionView,
  PortfolioRefreshResult,
  PortfolioRealizedHistoryView,
  PortfolioSummaryView,
  UpdatePortfolioLedgerInput,
} from '../../shared/portfolio/types';
import { isAllAccountsId, ALL_ACCOUNTS_ID } from '../../shared/accounts/constants';
import type { DividendGoalSettings } from '../../shared/portfolio/dividend-goal';
import { dividendGoalStorageKey, normalizeDividendGoalSettings } from '../../shared/portfolio/dividend-goal';
import type { FeeProfileRates } from '../../shared/accounts/types';
import type { AppDatabase } from '../database/database';
import { normalizeSymbol } from '../market/eastmoney/symbols';
import { marketService } from '../market/market-service';
import { buildProjectedDividends, matchDividendEvent } from './dividend-matcher';
import {
  buildDividendCalendar,
  buildPortfolioSummary,
  computeExpectedFromEvents,
  computeYtdReceived,
} from './dividend-stats';
import { aggregatePositions } from './ledger-service';
import { computePositionDailyPnl, sumDailyPnl } from './position-daily-pnl';
import { buildRealizedHistory } from './realized-pnl';
import { computeReferenceUnrealizedPnl, computeReferenceReturnPercent, inferMarketFromSymbol } from './reference-unrealized-pnl';

export class PortfolioService {
  private lastRefreshedAt: string | null = null;

  constructor(private readonly database: AppDatabase) {}

  async listPositions(accountId?: string): Promise<PortfolioPositionView[]> {
    const portfolio = this.database.portfolio;
    const ledger = isAllAccountsId(accountId) ? portfolio.listAllLedger() : portfolio.listLedger(accountId);
    const aggregates = aggregatePositions(ledger);
    if (aggregates.length === 0) return [];

    const symbols = aggregates.map((item) => item.symbol);
    const quotes = await marketService.getQuotes(symbols);
    const quoteMap = new Map(quotes.map((quote) => [normalizeSymbol(quote.symbol), quote]));
    const dividends = isAllAccountsId(accountId)
      ? portfolio.listAllDividends()
      : portfolio.listDividends(portfolio.resolveAccountId(accountId));
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
    const ledgerBySymbol = new Map<string, PortfolioLedgerEntry[]>();
    for (const entry of ledger) {
      const list = ledgerBySymbol.get(entry.symbol) ?? [];
      list.push(entry);
      ledgerBySymbol.set(entry.symbol, list);
    }

    return aggregates.map((position) => {
      const quote = quoteMap.get(normalizeSymbol(position.symbol));
      const marketPrice = quote?.price ?? quote?.nav ?? null;
      const marketValue = marketPrice === null ? null : marketPrice * position.quantity;
      const symbolDividends = dividends.filter((record) => record.symbol === position.symbol);
      const ytd = computeYtdReceived(symbolDividends, year);
      const holdings = new Map([[position.symbol, position.quantity]]);
      const expected = computeExpectedFromEvents(holdings, allUpcoming);
      const symbolEntries = ledgerBySymbol.get(position.symbol) ?? [];
      const feeProfile = this.resolveFeeProfile(accountId, symbolEntries);
      const unrealizedPnl =
        marketPrice === null
          ? null
          : computeReferenceUnrealizedPnl({
              marketPrice,
              quantity: position.quantity,
              totalCost: position.totalCost,
              kind: position.kind,
              market: inferMarketFromSymbol(position.symbol),
              feeProfile,
            });
      const dailyPnl = computePositionDailyPnl({
        kind: position.kind,
        entries: symbolEntries,
        marketPrice,
        quote,
        referenceUnrealizedPnl: unrealizedPnl,
        firstBuyAt: position.firstBuyAt,
      });
      const unrealizedReturnPercent =
        unrealizedPnl === null ? null : computeReferenceReturnPercent(unrealizedPnl, position.totalCost);

      return {
        symbol: position.symbol,
        name: quote?.name ?? position.symbol,
        kind: position.kind,
        quantity: position.quantity,
        avgPrice: position.avgPrice,
        avgCost: position.avgCost,
        marketPrice,
        marketValue,
        unrealizedPnl,
        unrealizedReturnPercent,
        dailyPnl,
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
    const records = isAllAccountsId(accountId)
      ? portfolio.listAllDividends(year)
      : portfolio.listDividends(portfolio.resolveAccountId(accountId), year);
    const expectedDividend = positions.reduce((sum, item) => sum + item.expectedDividend, 0);
    const totalMarketValue = positions.reduce((sum, item) => sum + (item.marketValue ?? 0), 0);
    const totalCost = positions.reduce((sum, item) => sum + item.avgCost * item.quantity, 0);
    const dailyPnl = sumDailyPnl(positions.map((item) => item.dailyPnl));
    const unrealizedPnl = positions.reduce((sum, item) => sum + (item.unrealizedPnl ?? 0), 0);

    return buildPortfolioSummary({
      year,
      records,
      expectedDividend,
      totalMarketValue,
      totalCost,
      dailyPnl,
      unrealizedPnl,
      lastRefreshedAt: this.lastRefreshedAt,
    });
  }

  async getDividendCalendar(accountId: string | undefined, month: string): Promise<DividendCalendarDay[]> {
    const portfolio = this.database.portfolio;
    const records = await this.enrichDividendNames(
      isAllAccountsId(accountId)
        ? portfolio.listAllDividends()
        : portfolio.listDividends(portfolio.resolveAccountId(accountId)),
    );
    const positions = await this.listPositions(accountId);
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

  async listLedgerEntries(accountId?: string, symbol?: string): Promise<PortfolioLedgerEntry[]> {
    return this.database.portfolio.listLedgerEntries(accountId, symbol);
  }

  async getRealizedHistory(accountId?: string, year?: number): Promise<PortfolioRealizedHistoryView> {
    const portfolio = this.database.portfolio;
    const ledger = isAllAccountsId(accountId) ? portfolio.listAllLedger() : portfolio.listLedger(accountId);
    const history = buildRealizedHistory(ledger, year);

    const symbols = [...new Set([
      ...history.trades.map((item) => item.symbol),
      ...history.closedPositions.map((item) => item.symbol),
    ])];
    const quotes = symbols.length > 0 ? await marketService.getQuotes(symbols) : [];
    const nameMap = new Map(quotes.map((quote) => [normalizeSymbol(quote.symbol), quote.name]));

    return {
      ...history,
      trades: history.trades.map((trade) => ({
        ...trade,
        name: nameMap.get(trade.symbol) ?? trade.symbol,
      })),
      closedPositions: history.closedPositions.map((item) => ({
        ...item,
        name: nameMap.get(item.symbol) ?? item.symbol,
      })),
    };
  }

  async updateLedgerEntry(id: string, input: UpdatePortfolioLedgerInput): Promise<PortfolioLedgerEntry> {
    return this.database.portfolio.updateLedgerEntry(id, input);
  }

  async deleteLedgerEntry(id: string): Promise<PortfolioPositionView[]> {
    const deleted = this.database.portfolio.deleteLedgerEntry(id);
    return this.listPositions(deleted.accountId);
  }

  async deletePosition(accountId: string | undefined, symbol: string): Promise<PortfolioPositionView[]> {
    const removed = this.database.portfolio.deletePositionLedger(accountId, symbol);
    if (removed === 0) throw new Error('未找到可删除的持仓流水');
    return this.listPositions(accountId);
  }

  async confirmDividend(
    id: string,
    confirmed: boolean,
    cashAmount?: number,
    accountId?: string,
    year = new Date().getFullYear(),
  ): Promise<PortfolioDividendRecord[]> {
    const status = confirmed ? 'confirmed' : 'rejected';
    const cents = cashAmount === undefined ? undefined : Math.round(cashAmount * 100);
    this.database.portfolio.setDividendStatus(id, status, cents);
    return this.listDividends(accountId, year);
  }

  async refreshDividends(accountId?: string, symbol?: string): Promise<PortfolioRefreshResult> {
    if (isAllAccountsId(accountId)) {
      const accountIds = this.database.portfolio.listActiveAccountIds();
      let synced = 0;
      let estimated = 0;
      for (const activeAccountId of accountIds) {
        const result = await this.refreshDividendsForAccount(activeAccountId, symbol);
        synced += result.synced;
        estimated += result.estimated;
      }
      this.lastRefreshedAt = new Date().toISOString();
      return { synced, estimated };
    }

    return this.refreshDividendsForAccount(this.database.portfolio.resolveAccountId(accountId), symbol);
  }

  private async refreshDividendsForAccount(
    accountId: string,
    symbol?: string,
  ): Promise<PortfolioRefreshResult> {
    const portfolio = this.database.portfolio;
    const ledger = portfolio.listLedger(accountId);
    const aggregates = aggregatePositions(ledger);
    const targets = symbol
      ? aggregates.filter((item) => item.symbol === symbol.trim().toUpperCase())
      : aggregates;

    const today = new Date().toISOString().slice(0, 10);
    const autoCutoff = shiftDate(today, -3);
    portfolio.autoConfirmPastDividends(accountId, autoCutoff);

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
            accountId,
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

  getDividendGoal(accountId?: string): DividendGoalSettings | null {
    const key = dividendGoalStorageKey(this.resolveGoalAccountId(accountId));
    const raw = this.database.portfolio.getPreference<unknown>(key);
    return normalizeDividendGoalSettings(raw);
  }

  saveDividendGoal(accountId: string | undefined, settings: DividendGoalSettings | null): DividendGoalSettings | null {
    const key = dividendGoalStorageKey(this.resolveGoalAccountId(accountId));
    const normalized = settings ? normalizeDividendGoalSettings(settings) : null;
    if (!normalized) {
      this.database.portfolio.deletePreference(key);
      return null;
    }
    this.database.portfolio.setPreference(key, normalized);
    return normalized;
  }

  private resolveGoalAccountId(accountId?: string): string {
    if (isAllAccountsId(accountId)) return ALL_ACCOUNTS_ID;
    return this.database.portfolio.resolveAccountId(accountId);
  }

  private resolveFeeProfile(
    accountId: string | undefined,
    symbolEntries: readonly PortfolioLedgerEntry[],
  ): FeeProfileRates {
    const { accounts } = this.database;
    if (accountId && !isAllAccountsId(accountId)) {
      const account = accounts.getAccount(accountId);
      if (!account.feeProfileId) throw new Error('账户未绑定费率模板');
      return accounts.getFeeProfileRates(account.feeProfileId);
    }

    const primaryAccountId = symbolEntries[0]?.accountId;
    if (primaryAccountId) {
      const account = accounts.getAccount(primaryAccountId);
      if (account.feeProfileId) {
        return accounts.getFeeProfileRates(account.feeProfileId);
      }
    }

    const defaultAccount = accounts.getDefaultAccount();
    return accounts.getFeeProfileRates(defaultAccount.feeProfileId!);
  }

  private async enrichDividendNames(records: PortfolioDividendRecord[]): Promise<PortfolioDividendRecord[]> {
    const symbols = [...new Set(records.map((record) => record.symbol))];
    if (symbols.length === 0) return records;

    const quotes = await marketService.getQuotes(symbols);
    const nameMap = new Map(quotes.map((quote) => [normalizeSymbol(quote.symbol), quote.name]));

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
