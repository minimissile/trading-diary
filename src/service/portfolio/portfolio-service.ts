import type {
  CreatePortfolioLedgerInput,
  DividendCalendarDay,
  DividendRecordStatus,
  PortfolioDividendRecord,
  PortfolioLedgerEntry,
  PortfolioPnlCalendarSyncResult,
  PortfolioPnlCalendarView,
  PortfolioPositionView,
  PortfolioRefreshResult,
  PortfolioRealizedHistoryView,
  PortfolioSummaryView,
  UpdatePortfolioLedgerInput,
} from '../../shared/portfolio/types';
import { isAllAccountsId, ALL_ACCOUNTS_ID } from '../../shared/accounts/constants';
import type { DividendGoalSettings } from '../../shared/portfolio/dividend-goal';
import { dividendGoalStorageKey, normalizeDividendGoalSettings } from '../../shared/portfolio/dividend-goal';
import type { DividendPayoutMode } from '../../shared/portfolio/dividend-payout';
import {
  dividendPayoutModeStorageKey,
  normalizeDividendPayoutMode,
  resolveDividendPayoutMode,
  supportsDividendPayoutMode,
} from '../../shared/portfolio/dividend-payout';
import { currentMonthPrefix, pnlCalendarWindowEnd, pnlCalendarWindowStart } from '../../shared/portfolio/pnl-calendar-window';
import type { InstrumentKind } from '../../shared/market/types';
import type { FeeProfileRates } from '../../shared/accounts/types';
import type { AppDatabase } from '../database/database';
import { createDailyBarSyncService, type DailyBarSyncService } from '../market/daily-bar-sync-service';
import { createFundProfileSyncService, FUND_PROFILE_STALE_MS, type FundProfileSyncService } from '../market/fund-profile-sync-service';
import { buildFundProfileSummary, shouldCacheFundProfile, type FundProfileRecord } from '../../shared/market/fund-profile';
import { instrumentPositionKey } from '../../shared/market/instrument-id';
import { quoteCurrencyForVenue } from '../../shared/market/venues';
import { normalizeSymbol } from '../market/eastmoney/symbols';
import { marketService } from '../market/market-service';
import { buildProjectedDividends, matchDividendEvent } from './dividend-matcher';
import { buildDividendReinvestPlan } from './dividend-reinvest';
import {
  buildDividendCalendar,
  buildPortfolioSummary,
  computeExpectedFromEvents,
  computeYtdReceived,
} from './dividend-stats';
import { aggregatePositions, computeOtcFundHoldMetrics } from './ledger-service';
import { resolveDividendEligibleQuantity } from './dividend-matcher';
import { computePositionDailyPnl, sumDailyPnl } from './position-daily-pnl';
import { buildRealizedHistory } from './realized-pnl';
import { buildPnlCalendar, indexDailyBars } from './pnl-calendar';
import { computeReferenceUnrealizedPnl, computeReferenceReturnPercent, inferMarketFromSymbol } from './reference-unrealized-pnl';

export class PortfolioService {
  private lastRefreshedAt: string | null = null;
  private readonly dailyBarSync: DailyBarSyncService;
  private readonly fundProfileSync: FundProfileSyncService;

  constructor(private readonly database: AppDatabase) {
    this.dailyBarSync = createDailyBarSyncService(database.marketDailyBars);
    this.fundProfileSync = createFundProfileSyncService(database.fundProfiles);
  }

  async listPositions(accountId?: string): Promise<PortfolioPositionView[]> {
    const portfolio = this.database.portfolio;
    const ledger = isAllAccountsId(accountId) ? portfolio.listAllLedger() : portfolio.listLedger(accountId);
    const aggregates = aggregatePositions(ledger);
    if (aggregates.length === 0) return [];

    const quotes = await marketService.getQuotes(
      aggregates.map((item) => ({
        symbol: item.symbol,
        venue: item.kind === 'otc_fund' ? 'OTC' : item.venue,
      })),
    );
    const quoteMap = new Map(
      quotes.map((quote) => [instrumentPositionKey({ venue: quote.venue, symbol: quote.symbol }), quote]),
    );
    const fundProfileMap = new Map(
      this.database.fundProfiles
        .list(aggregates.filter((item) => item.venue === 'SH' || item.venue === 'SZ' || item.venue === 'OTC').map((item) => item.symbol))
        .map((record) => [record.symbol, record]),
    );
    this.scheduleFundProfileMaintenance(
      aggregates.map((item) => ({ symbol: item.symbol, kind: item.kind })),
      fundProfileMap,
    );
    const dividends = isAllAccountsId(accountId)
      ? portfolio.listAllDividends()
      : portfolio.listDividends(portfolio.resolveAccountId(accountId));
    const year = new Date().getFullYear();

    const upcomingBySymbol = await Promise.all(
      aggregates
        .filter((item) => item.venue === 'SH' || item.venue === 'SZ' || item.venue === 'OTC')
        .map(async (item) => {
        try {
          const result = await marketService.listDividends(item.symbol, 1, 20);
          return { key: instrumentPositionKey(item), items: result.items };
        } catch {
          return { key: instrumentPositionKey(item), items: [] };
        }
      }),
    );
    const allUpcoming = upcomingBySymbol.flatMap((item) => item.items);
    const ledgerByKey = new Map<string, PortfolioLedgerEntry[]>();
    for (const entry of ledger) {
      const key = instrumentPositionKey(entry);
      const list = ledgerByKey.get(key) ?? [];
      list.push(entry);
      ledgerByKey.set(key, list);
    }

    return aggregates.map((position) => {
      const posKey = instrumentPositionKey(position);
      const quoteKey = instrumentPositionKey({
        symbol: position.symbol,
        venue: position.kind === 'otc_fund' ? 'OTC' : position.venue,
      });
      const quote = quoteMap.get(quoteKey);
      const marketPrice = quote?.price ?? quote?.nav ?? null;
      const marketValue = marketPrice === null ? null : marketPrice * position.quantity;
      const symbolDividends = dividends.filter(
        (record) => record.symbol === position.symbol,
      );
      const ytd = computeYtdReceived(symbolDividends, year);
      const holdings = new Map([[position.symbol, position.quantity]]);
      const expected = computeExpectedFromEvents(holdings, allUpcoming);
      const symbolEntries = ledgerByKey.get(posKey) ?? [];
      const cashDividendsReceived = symbolDividends
        .filter((item) => item.status === 'confirmed' && item.payoutMode === 'cash')
        .reduce((sum, item) => sum + item.cashAmount, 0);
      const otcHoldMetrics =
        position.kind === 'otc_fund'
          ? computeOtcFundHoldMetrics(symbolEntries, cashDividendsReceived)
          : null;
      const displayAvgPrice = otcHoldMetrics?.holdPrice ?? position.avgPrice;
      const displayAvgCost = otcHoldMetrics?.holdPrice ?? position.avgCost;
      const displayTotalCost = otcHoldMetrics?.totalCost ?? position.totalCost;
      const feeProfile = this.resolveFeeProfile(accountId, symbolEntries);
      const feeMarket =
        position.venue === 'HK' ? 'HK' : position.venue === 'US' ? 'US' : inferMarketFromSymbol(position.symbol);
      const unrealizedPnl =
        marketPrice === null
          ? null
          : computeReferenceUnrealizedPnl({
              marketPrice,
              quantity: position.quantity,
              totalCost: displayTotalCost,
              kind: position.kind,
              market: feeMarket,
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
        unrealizedPnl === null ? null : computeReferenceReturnPercent(unrealizedPnl, displayTotalCost);

      const cachedFundProfile = fundProfileMap.get(normalizeSymbol(position.symbol));
      const fundProfile = cachedFundProfile ? buildFundProfileSummary(cachedFundProfile.profile) : null;
      const fundProfileName =
        typeof cachedFundProfile?.profile.SHORTNAME === 'string'
          ? cachedFundProfile.profile.SHORTNAME
          : null;

      return {
        symbol: position.symbol,
        venue: position.venue,
        quoteCurrency: quote?.quoteCurrency ?? quoteCurrencyForVenue(position.venue),
        name: quote?.name ?? fundProfileName ?? position.symbol,
        kind: position.kind,
        quantity: position.quantity,
        avgPrice: displayAvgPrice,
        avgCost: displayAvgCost,
        marketPrice,
        marketValue,
        unrealizedPnl,
        unrealizedReturnPercent,
        dailyPnl,
        firstBuyAt: position.firstBuyAt,
        ytdDividendReceived: ytd,
        expectedDividend: expected,
        dividendYieldTtm: quote?.dividendYieldTtm ?? null,
        fundProfile,
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
    this.dailyBarSync.scheduleSymbols([payload.symbol], new Map([[payload.symbol, payload.kind!]]));
    if (payload.kind && shouldCacheFundProfile(payload.kind)) {
      await this.fundProfileSync.syncSymbol(payload.symbol, payload.kind);
    }
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
    const quotes = symbols.length > 0 ? await marketService.getQuotesBySymbols(symbols) : [];
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

  async getPnlCalendar(accountId?: string, month?: string): Promise<PortfolioPnlCalendarView> {
    const portfolio = this.database.portfolio;
    const ledger = isAllAccountsId(accountId) ? portfolio.listAllLedger() : portfolio.listLedger(accountId);
    const resolvedMonth = month ?? currentMonthPrefix();
    const symbols = [...new Set(ledger.map((entry) => entry.symbol))];

    const windowStart = pnlCalendarWindowStart();
    const windowEnd = pnlCalendarWindowEnd();
    const bars = this.database.marketDailyBars.listBarsForSymbols(symbols, windowStart, windowEnd);
    const barsBySymbol = indexDailyBars(bars);
    const dividends = isAllAccountsId(accountId)
      ? portfolio.listAllDividends()
      : portfolio.listDividends(portfolio.resolveAccountId(accountId));

    const built = buildPnlCalendar({
      ledger,
      dividends,
      barsBySymbol,
      month: resolvedMonth,
    });

    const missingBarSymbols = symbols.filter((symbol) => !barsBySymbol.has(symbol));

    return {
      month: resolvedMonth,
      days: built.days.map((day) => ({
        date: day.date,
        totalPnl: day.totalPnl,
        dividendPnl: day.dividendPnl,
        positionPnl: day.positionPnl,
      })),
      summary: built.summary,
      windowStart: built.windowStart,
      windowEnd: built.windowEnd,
      missingBarSymbols,
    };
  }

  async syncPnlCalendarBars(accountId?: string): Promise<PortfolioPnlCalendarSyncResult> {
    const portfolio = this.database.portfolio;
    const ledger = isAllAccountsId(accountId) ? portfolio.listAllLedger() : portfolio.listLedger(accountId);
    const symbols = [...new Set(ledger.map((entry) => entry.symbol))];
    return this.syncPnlCalendarSymbols(symbols, collectSymbolKinds(ledger));
  }

  async syncPnlCalendarBar(accountId: string | undefined, symbol: string): Promise<PortfolioPnlCalendarSyncResult> {
    const portfolio = this.database.portfolio;
    const ledger = isAllAccountsId(accountId) ? portfolio.listAllLedger() : portfolio.listLedger(accountId);
    const normalized = symbol.trim().toUpperCase();
    const entry = ledger.find((item) => item.symbol === normalized);
    const kinds = new Map<string, InstrumentKind>([[normalized, entry?.kind ?? 'stock']]);
    return this.syncPnlCalendarSymbols([normalized], kinds);
  }

  private async syncPnlCalendarSymbols(
    symbols: readonly string[],
    symbolKinds: ReadonlyMap<string, InstrumentKind>,
  ): Promise<PortfolioPnlCalendarSyncResult> {
    if (symbols.length === 0) {
      return { items: [] };
    }

    const results = await this.dailyBarSync.syncSymbolsNow(symbols, symbolKinds);
    const quotes = await marketService.getQuotesBySymbols(symbols);
    const nameMap = new Map(quotes.map((quote) => [normalizeSymbol(quote.symbol), quote.name]));

    return {
      items: results.map((item) => ({
        symbol: item.symbol,
        name: nameMap.get(item.symbol) ?? item.symbol,
        synced: item.synced,
        skipped: item.skipped,
        error: item.error,
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
    const portfolio = this.database.portfolio;
    const status = confirmed ? 'confirmed' : 'rejected';
    const cents = cashAmount === undefined ? undefined : Math.round(cashAmount * 100);
    let record = portfolio.setDividendStatus(id, status, cents);
    if (confirmed && record.payoutMode === 'reinvest') {
      record = await this.syncDividendReinvestLedger(record);
    } else if (!confirmed && record.reinvestLedgerId) {
      portfolio.deleteLedgerEntry(record.reinvestLedgerId);
      record = portfolio.setDividendReinvestLedgerId(record.id, null);
    }
    return this.listDividends(accountId, year);
  }

  getDividendPayoutDefault(accountId: string, symbol: string): DividendPayoutMode | null {
    const resolvedAccountId = this.database.portfolio.resolveAccountId(accountId);
    const key = dividendPayoutModeStorageKey(resolvedAccountId, symbol);
    return normalizeDividendPayoutMode(this.database.portfolio.getPreference(key));
  }

  async setDividendPayoutMode(
    id: string,
    payoutMode: DividendPayoutMode,
    options?: { setDefault?: boolean; accountId?: string; year?: number },
  ): Promise<PortfolioDividendRecord[]> {
    const portfolio = this.database.portfolio;
    const record = portfolio.getDividendById(id);
    if (!supportsDividendPayoutMode(record.kind)) {
      throw new Error('该标的不支持切换分红方式');
    }
    if (record.payoutMode === payoutMode && !options?.setDefault) {
      return this.listDividends(options?.accountId, options?.year ?? new Date().getFullYear());
    }

    let updated = portfolio.setDividendPayoutMode(id, payoutMode);
    updated = await this.syncDividendReinvestLedger(updated);

    if (options?.setDefault) {
      const key = dividendPayoutModeStorageKey(updated.accountId, updated.symbol);
      this.database.portfolio.setPreference(key, payoutMode);
    }

    return this.listDividends(options?.accountId, options?.year ?? new Date().getFullYear());
  }

  private async syncDividendReinvestLedger(record: PortfolioDividendRecord): Promise<PortfolioDividendRecord> {
    const portfolio = this.database.portfolio;
    const shouldReinvest = record.payoutMode === 'reinvest' && record.status === 'confirmed';

    if (!shouldReinvest) {
      if (record.reinvestLedgerId) {
        try {
          portfolio.deleteLedgerEntry(record.reinvestLedgerId);
        } catch {
          // 流水可能已被用户删除
        }
        return portfolio.setDividendReinvestLedgerId(record.id, null);
      }
      return record;
    }

    const plan = await buildDividendReinvestPlan(this.refreshDividendAmounts(record));

    if (record.reinvestLedgerId) {
      await this.updateLedgerEntry(record.reinvestLedgerId, {
        side: 'dividend_reinvest',
        quantity: plan.quantity,
        price: plan.price,
        tradeAt: plan.tradeAt,
        note: plan.note,
      });
      return portfolio.getDividendById(record.id);
    }

    const ledger = portfolio.addLedgerEntry({
      accountId: record.accountId,
      symbol: record.symbol,
      kind: record.kind,
      side: 'dividend_reinvest',
      quantity: plan.quantity,
      price: plan.price,
      fees: 0,
      tradeAt: plan.tradeAt,
      note: plan.note,
      source: 'manual',
    });
    return portfolio.setDividendReinvestLedgerId(record.id, ledger.id);
  }

  private refreshDividendAmounts(record: PortfolioDividendRecord): PortfolioDividendRecord {
    const portfolio = this.database.portfolio;
    const symbolLedger = portfolio
      .listLedger(record.accountId)
      .filter((entry) => entry.symbol === record.symbol);
    const eligibleQuantity = resolveDividendEligibleQuantity(
      symbolLedger,
      { exDividendDate: record.exDividendDate, recordDate: record.recordDate },
      record.kind,
    );
    const cashAmount = record.cashPerShare * eligibleQuantity;
    if (
      Math.abs(eligibleQuantity - record.eligibleQuantity) > 1e-6 ||
      Math.abs(cashAmount - record.cashAmount) > 0.01
    ) {
      return portfolio.updateDividendEligibleAmount(record.id, eligibleQuantity, cashAmount);
    }
    return record;
  }

  private async syncPendingReinvestLedgers(accountId: string): Promise<void> {
    const records = this.database.portfolio
      .listDividends(accountId)
      .filter((item) => item.status === 'confirmed' && item.payoutMode === 'reinvest' && !item.reinvestLedgerId);

    for (const record of records) {
      try {
        await this.syncDividendReinvestLedger(record);
      } catch {
        // 历史净值缺失时跳过，用户可在明细中手动切换触发重试
      }
    }
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
    const existingRows = portfolio.listDividends(accountId);

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

          const existing = existingRows.find(
            (item) => item.symbol === match.upsert!.symbol && item.exDividendDate === match.upsert!.exDividendDate,
          );
          const payoutMode = existing
            ? existing.payoutMode
            : resolveDividendPayoutMode({
                kind: match.upsert.kind,
                event,
                defaultMode: this.getDividendPayoutDefault(accountId, match.upsert.symbol),
              });

          const record = portfolio.upsertDividend({ ...match.upsert, payoutMode });
          if (record.status === 'confirmed' && record.payoutMode === 'reinvest') {
            try {
              await this.syncDividendReinvestLedger(record);
            } catch {
              // 历史净值缺失时保留分红记录，稍后可手动切换重试
            }
          }
          synced += 1;
          if (match.upsert.status === 'estimated') estimated += 1;
        }

        page += 1;
        if (result.items.length === 0) break;
      }
    }

    await this.syncPendingReinvestLedgers(accountId);

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

  private scheduleFundProfileMaintenance(
    positions: ReadonlyArray<{ symbol: string; kind: InstrumentKind }>,
    cached: ReadonlyMap<string, FundProfileRecord>,
  ): void {
    const now = Date.now();
    const targets = positions.filter((item) => {
      if (!shouldCacheFundProfile(item.kind)) return false;
      const record = cached.get(normalizeSymbol(item.symbol));
      if (!record) return true;
      return now - new Date(record.fetchedAt).getTime() >= FUND_PROFILE_STALE_MS;
    });
    if (targets.length === 0) return;

    this.fundProfileSync.scheduleSymbols(
      targets.map((item) => item.symbol),
      new Map(targets.map((item) => [normalizeSymbol(item.symbol), item.kind])),
    );
  }

  private async enrichDividendNames(records: PortfolioDividendRecord[]): Promise<PortfolioDividendRecord[]> {
    if (records.length === 0) return records;

    const symbols = [...new Set(records.map((record) => record.symbol))];
    const kindBySymbol = new Map<string, InstrumentKind>();
    for (const record of records) {
      kindBySymbol.set(record.symbol, record.kind);
    }

    const quotes = await marketService.getQuotes(
      symbols.map((symbol) => ({
        symbol,
        venue: kindBySymbol.get(symbol) === 'otc_fund' ? ('OTC' as const) : undefined,
      })),
    );
    const quoteNameMap = new Map(quotes.map((quote) => [normalizeSymbol(quote.symbol), quote.name]));

    const fundNameMap = new Map<string, string>();
    for (const profile of this.database.fundProfiles.list(symbols)) {
      const shortName = profile.profile.SHORTNAME;
      if (typeof shortName === 'string' && shortName.trim()) {
        fundNameMap.set(profile.symbol, shortName.trim());
      }
    }

    const resolveNameMap = new Map<string, string>();
    await Promise.all(
      symbols.map(async (symbol) => {
        if (quoteNameMap.get(symbol) || fundNameMap.get(symbol)) return;
        try {
          const instrument = await marketService.resolve(symbol);
          if (instrument.name.trim() && instrument.name !== symbol) {
            resolveNameMap.set(symbol, instrument.name.trim());
          }
        } catch {
          // 忽略无法解析的标的
        }
      }),
    );

    return records.map((record) => ({
      ...record,
      name:
        quoteNameMap.get(record.symbol) ??
        fundNameMap.get(record.symbol) ??
        resolveNameMap.get(record.symbol) ??
        record.symbol,
    }));
  }
}

function shiftDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function collectSymbolKinds(ledger: readonly PortfolioLedgerEntry[]): Map<string, InstrumentKind> {
  const map = new Map<string, InstrumentKind>();
  for (const entry of ledger) {
    map.set(entry.symbol, entry.kind);
  }
  return map;
}

export function createPortfolioService(database: AppDatabase): PortfolioService {
  return new PortfolioService(database);
}
