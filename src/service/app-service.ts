import path from 'node:path';
import { z } from 'zod';
import { PROMPT_IDS } from '../shared/llm/prompt-id';
import { LlmError } from '../shared/llm/errors';
import type { ServiceRequest, ServiceStreamEvent, ServiceStreamMethod } from '../shared/service.types';
import { ImageStore } from './assets/image-store';
import { AppDatabase } from './database/database';
import { debugRunStream, previewPrompt } from './llm/debug-service';
import { createLlmRunner, type LlmRunner } from './llm/llm-runner';
import { generateReviewAiDraft, generateReviewAiDraftStream } from './reviews/review-ai-service';
import { generateCompanyAnswerStream } from './company-assistant/company-assistant-service';
import { marketService } from './market/market-service';
import { LonghubangService } from './longhubang/longhubang-service';
import { StockStrategyService } from './strategy/strategy-service';
import { QuantResearchService } from './quant-research/quant-service';
import { ResearchWorkbenchService } from './quant-research/research-service';
import { watchlistService } from './watchlist/watchlist-service';
import { createPortfolioService, type PortfolioService } from './portfolio/portfolio-service';
import { AccountService } from './accounts/account-service';
import { LicenseService } from './license/license-service';
import { LicenseError } from '../shared/license/errors';
import { BackupService } from './backup/backup-service';
import { ExecutionImportService } from './import/execution-import-service';
import { pollActiveAlerts } from './alerts/alert-poll-service';
import { createLofArbitrageService, type LofArbitrageService } from './lof-arbitrage/lof-arbitrage-service';
import { pollLofArbitrage } from './lof-arbitrage/lof-poll-service';
import { createSipService, type SipService } from './sip/sip-service';
import { createSipImportService, type SipImportService } from './sip/sip-import-service';
import { createSipAiImportService, type SipAiImportService } from './sip/sip-ai-import-service';
import { createLedgerAiImportService, type LedgerAiImportService } from './portfolio/ledger-ai-import-service';
import { saveLedgerImportPasteImages, readLedgerImportImagePreviews } from './portfolio/ledger-import-paste-store';
import { AccessLockStore } from './security/access-lock-store';

const reviewAiDraftParamsSchema = z
  .object({
    planId: z.uuid().nullable(),
    symbol: z.string().trim().min(1).max(32),
    title: z.string().trim().min(1).max(120),
    direction: z.enum(['long', 'short']),
    planned: z.boolean(),
    entryPrice: z.number().finite().positive(),
    exitPrice: z.number().finite().positive(),
    quantity: z.number().finite().positive(),
    fees: z.number().finite().nonnegative(),
    executionScore: z.number().int().min(1).max(5),
    partialSummary: z.string().trim().max(2_000).optional(),
    partialLesson: z.string().trim().max(2_000).optional(),
  })
  .strict();

const companyAssistantParamsSchema = z
  .object({
    symbol: z.string().trim().min(1).max(32),
    question: z.string().trim().min(1).max(1_000),
    history: z
      .array(
        z
          .object({
            role: z.enum(['user', 'assistant']),
            content: z.string().trim().min(1).max(4_000),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();

const llmPreviewParamsSchema = z
  .object({
    promptId: z.enum([PROMPT_IDS.REVIEW_SUMMARIZE, PROMPT_IDS.RELEASE_NOTES, PROMPT_IDS.RELEASE_PLAN]),
    variables: z.record(z.string(), z.string()),
  })
  .strict();

const llmDebugRunParamsSchema = z
  .object({
    promptId: z.enum([PROMPT_IDS.REVIEW_SUMMARIZE, PROMPT_IDS.RELEASE_NOTES, PROMPT_IDS.RELEASE_PLAN]),
    variables: z.record(z.string(), z.string()),
  })
  .strict();

export class AppService {
  private researchWorkbench: ResearchWorkbenchService | null = null;
  private getResearchWorkbench(): ResearchWorkbenchService {
    this.researchWorkbench ??= new ResearchWorkbenchService(this.database.quantWorkbench);
    return this.researchWorkbench;
  }
  private quantResearchService: QuantResearchService | null = null;

  private getQuantResearchService(): QuantResearchService {
    this.quantResearchService ??= new QuantResearchService(this.database.quantResearch, () =>
      this.database.watchlist.list().filter((item) => item.kind === 'stock' && (item.venue === 'SH' || item.venue === 'SZ')),
    );
    return this.quantResearchService;
  }

  private stockStrategyService: StockStrategyService | null = null;

  private getStockStrategyService(): StockStrategyService {
    this.stockStrategyService ??= new StockStrategyService(this.dataDir, () => this.database.watchlist.list());
    return this.stockStrategyService;
  }
  private readonly startedAt = new Date().toISOString();
  private readonly dataDir: string;
  private readonly database: AppDatabase;
  private readonly images: ImageStore;
  private readonly llmRunner: LlmRunner;
  private readonly portfolioService: PortfolioService;
  private readonly accountService: AccountService;
  private readonly licenseService: LicenseService;
  private readonly backupService: BackupService;
  private readonly executionImportService: ExecutionImportService;
  private readonly sipService: SipService;
  private readonly sipImportService: SipImportService;
  private readonly sipAiImportService: SipAiImportService;
  private readonly ledgerAiImportService: LedgerAiImportService;
  private readonly lofArbitrageService: LofArbitrageService;
  private readonly longhubangService: LonghubangService;
  private readonly accessLockStore: AccessLockStore;

  constructor(dataDir: string, appVersion: string) {
    this.dataDir = dataDir;
    this.database = new AppDatabase(path.join(dataDir, 'database', 'app.sqlite'));
    this.images = new ImageStore(dataDir, this.database);
    this.llmRunner = createLlmRunner(dataDir);
    this.portfolioService = createPortfolioService(this.database);
    this.accountService = new AccountService(this.database.accounts, this.portfolioService);
    this.licenseService = new LicenseService(dataDir);
    this.backupService = new BackupService(dataDir, this.database, appVersion);
    this.executionImportService = new ExecutionImportService(this.database.episodes);
    this.sipService = createSipService(this.database);
    this.sipImportService = createSipImportService(this.database);
    this.sipAiImportService = createSipAiImportService(this.sipImportService, this.llmRunner);
    this.ledgerAiImportService = createLedgerAiImportService(
      this.database,
      this.portfolioService,
      this.sipImportService,
      this.llmRunner,
    );
    this.lofArbitrageService = createLofArbitrageService(this.database);
    this.longhubangService = new LonghubangService(this.database.longhubang);
    this.accessLockStore = new AccessLockStore(dataDir);
  }

  close(): void {
    this.database.close();
  }

  async handle(request: ServiceRequest): Promise<unknown> {
    switch (request.method) {
      case 'quantResearch.toolState':
        return this.getResearchWorkbench().state(request.params.kind);
      case 'quantResearch.toolSave':
        return this.getResearchWorkbench().save(request.params);
      case 'quantResearch.toolRun':
        return this.getResearchWorkbench().run(request.params);
      case 'quantResearch.report':
        return this.getResearchWorkbench().get(request.params.id);
      case 'quantResearch.state':
        return this.getQuantResearchService().getState();
      case 'quantResearch.save':
        return this.getQuantResearchService().saveSettings(request.params);
      case 'quantResearch.scan':
        return this.getQuantResearchService().scan(request.params);
      case 'quantResearch.run':
        return this.getQuantResearchService().getRun(request.params.id);
      case 'stockStrategy.state':
        return this.getStockStrategyService().getState();
      case 'stockStrategy.save':
        return this.getStockStrategyService().saveSettings(request.params);
      case 'stockStrategy.screen':
        return this.getStockStrategyService().screen(request.params);
      case 'stockStrategy.backtest':
        return this.getStockStrategyService().backtest(request.params);
      case 'longhubang.status':
        return this.longhubangService.getStatus(request.params.refresh);
      case 'longhubang.query':
        return this.longhubangService.query(request.params);
      case 'longhubang.detail':
        return this.longhubangService.getDetail(request.params);
      case 'system.health':
        return {
          servicePid: process.pid,
          startedAt: this.startedAt,
          sqliteVersion: this.database.sqliteVersion(),
          schemaVersion: this.database.schemaVersion(),
          storageReady: true,
        };
      case 'assets.stats':
        return this.images.stats();
      case 'assets.import':
        return this.images.importFile(request.params.sourcePath);
      case 'assets.resolve':
        return {
          filePath: await this.images.resolve(request.params.hash, request.params.variant),
        };
      case 'workspace.snapshot': {
        this.sipService.scanDue();
        const base = this.database.workspaceSnapshot();
        const withSip = this.sipService.extendWorkspaceSnapshot(base);
        return this.lofArbitrageService.extendWorkspaceSnapshot(withSip, []);
      }
      case 'plans.list':
        return this.database.listTradingPlans();
      case 'plans.create':
        this.licenseService.assertCanCreatePlan(this.database.listTradingPlans().length);
        return this.database.createTradingPlan(request.params);
      case 'plans.setStatus':
        return this.database.setTradingPlanStatus(request.params.id, request.params.status);
      case 'alerts.list':
        return this.database.listTradeAlerts();
      case 'alerts.create':
        this.licenseService.assertCanCreateAlert(this.database.listTradeAlerts().length);
        return this.database.createTradeAlert(request.params);
      case 'alerts.setStatus':
        return this.database.setTradeAlertStatus(request.params.id, request.params.status);
      case 'alerts.evaluatePrice':
        return this.database.evaluatePrice(request.params.symbol, request.params.price);
      case 'reviews.list':
        return this.database.listTradeReviews();
      case 'reviews.create':
        return this.database.createTradeReview(request.params);
      case 'reviews.generateAiDraft':
        this.licenseService.assertFeature('ai_review');
        return generateReviewAiDraft(this.database, this.llmRunner, request.params);
      case 'settings.saveLlmApiKey': {
        const store = this.llmRunner.getCredentialStore();
        if (!store) throw new Error('凭据存储不可用');
        store.saveApiKey(request.params.apiKey);
        return { configured: true };
      }
      case 'settings.getLlmStatus': {
        const store = this.llmRunner.getCredentialStore();
        return { configured: Boolean(store?.hasConfiguredKey()) };
      }
      case 'settings.testLlmConnection':
        return this.llmRunner.testConnection();
      case 'settings.getLlmUsage': {
        const summary = this.llmRunner.getUsageSummary();
        if (!summary) throw new Error('用量统计不可用');
        return summary;
      }
      case 'settings.getLlmSettings': {
        const settings = this.llmRunner.getSettings();
        if (!settings) throw new Error('AI 设置不可用');
        return settings;
      }
      case 'settings.saveLlmSettings':
        return this.llmRunner.saveSettings(request.params);
      case 'settings.getAccessLock':
        return this.accessLockStore.getSettings();
      case 'settings.verifyAccessLock':
        return { valid: this.accessLockStore.verifyPassword(request.params.password) };
      case 'settings.enableAccessLock':
        return this.accessLockStore.enable(request.params.newPassword);
      case 'settings.enableExistingAccessLock':
        return this.accessLockStore.enableExisting();
      case 'settings.disableAccessLock':
        return this.accessLockStore.disable(request.params.password);
      case 'settings.changeAccessLockPassword':
        return this.accessLockStore.changePassword(request.params.currentPassword, request.params.newPassword);
      case 'llm.previewPrompt': {
        const params = llmPreviewParamsSchema.parse(request.params);
        return previewPrompt(this.llmRunner, params.promptId, params.variables);
      }
      case 'market.resolve':
        return marketService.resolve(request.params.symbol);
      case 'market.search':
        return marketService.search(
          request.params.query,
          request.params.limit,
          request.params.marketScopes,
          request.params.assetKind,
        );
      case 'market.getQuote':
        return marketService.getQuote(request.params.symbol);
      case 'market.getQuotes':
        return marketService.getQuotesBySymbols(request.params.symbols);
      case 'market.getSnapshot':
        return marketService.getSnapshot(request.params.symbol);
      case 'market.listDividends':
        return marketService.listDividends(
          request.params.symbol,
          request.params.page,
          request.params.pageSize,
        );
      case 'market.listNews':
        return marketService.listNews(request.params.symbol, request.params.pageSize);
      case 'market.listKlines':
        return marketService.listKlines(
          request.params.symbol,
          request.params.period,
          request.params.adjust,
          request.params.limit,
          request.params.beforeTimestamp,
        );
      case 'watchlist.listPools':
        return watchlistService.listPools();
      case 'watchlist.listPersonal':
        return { items: this.database.watchlist.list(), groups: this.database.watchlist.listGroups() };
      case 'watchlist.add': {
        const instrument = await marketService.resolve(request.params.symbol);
        const existing = this.database.watchlist.find(instrument.symbol, instrument.venue);
        if (existing) return { item: existing, alreadyExists: true };
        const quotes = await marketService.getQuotes([instrument]).catch(() => []);
        return this.database.watchlist.add(instrument, quotes[0] ?? null, request.params);
      }
      case 'watchlist.update':
        return this.database.watchlist.update(request.params.id, request.params.changes);
      case 'watchlist.remove':
        return this.database.watchlist.remove(request.params.id);
      case 'watchlist.move':
        return this.database.watchlist.move(request.params.id, request.params.direction);
      case 'watchlist.saveGroup':
        return this.database.watchlist.saveGroup(request.params);
      case 'watchlist.removeGroup':
        return this.database.watchlist.removeGroup(request.params.id);
      case 'watchlist.listLogs':
        return this.database.watchlist.listLogs(request.params.itemId);
      case 'watchlist.saveLog':
        return this.database.watchlist.saveLog(request.params);
      case 'watchlist.removeLog':
        return this.database.watchlist.removeLog(request.params.id, request.params.itemId);
      case 'watchlist.setReminder':
        if (request.params.reminder && !this.database.watchlist.get(request.params.id).reminder) {
          this.licenseService.assertCanCreateAlert(this.database.countTradeAlerts());
        }
        return this.database.watchlist.setReminder(request.params);
      case 'watchlist.getPoolSnapshot':
        this.licenseService.assertWatchlistPoolAllowed(request.params.poolId);
        return watchlistService.getPoolSnapshot(request.params.poolId);
      case 'portfolio.listPositions':
        return this.portfolioService.listPositions(request.params.accountId);
      case 'portfolio.getSummary':
        return this.portfolioService.getSummary(request.params.accountId, request.params.year);
      case 'portfolio.getDividendCalendar':
        return this.portfolioService.getDividendCalendar(request.params.accountId, request.params.month);
      case 'portfolio.listDividends':
        return this.portfolioService.listDividends(
          request.params.accountId,
          request.params.year,
          request.params.statuses,
        );
      case 'portfolio.addLedgerEntry':
        return this.portfolioService.addLedgerEntry(request.params);
      case 'portfolio.listLedgerEntries':
        return this.portfolioService.listLedgerEntries(request.params.accountId, request.params.symbol);
      case 'portfolio.getRealizedHistory':
        return this.portfolioService.getRealizedHistory(request.params.accountId, request.params.year);
      case 'portfolio.getPnlCalendar':
        return this.portfolioService.getPnlCalendar(request.params.accountId, request.params.month);
      case 'portfolio.syncPnlCalendarBars':
        return this.portfolioService.syncPnlCalendarBars(request.params.accountId);
      case 'portfolio.syncPnlCalendarBar':
        return this.portfolioService.syncPnlCalendarBar(request.params.accountId, request.params.symbol);
      case 'portfolio.updateLedgerEntry':
        return this.portfolioService.updateLedgerEntry(request.params.id, request.params.input);
      case 'portfolio.deleteLedgerEntry':
        return this.portfolioService.deleteLedgerEntry(request.params.id);
      case 'portfolio.deletePosition':
        return this.portfolioService.deletePosition(request.params.accountId, request.params.symbol);
      case 'portfolio.confirmDividend':
        return this.portfolioService.confirmDividend(
          request.params.id,
          request.params.confirmed,
          request.params.cashAmount,
          request.params.accountId,
          request.params.year,
        );
      case 'portfolio.refreshDividends':
        this.licenseService.assertFeature('portfolio_dividend_sync');
        return this.portfolioService.refreshDividends(request.params.accountId, request.params.symbol);
      case 'portfolio.syncMarketQuotes':
        return this.portfolioService.syncMarketQuotes(request.params.accountId);
      case 'portfolio.getDividendGoal':
        return this.portfolioService.getDividendGoal(request.params.accountId);
      case 'portfolio.saveDividendGoal':
        return this.portfolioService.saveDividendGoal(request.params.accountId, request.params.settings);
      case 'portfolio.getDividendPayoutDefault':
        return this.portfolioService.getDividendPayoutDefault(
          request.params.accountId,
          request.params.symbol,
        );
      case 'portfolio.setDividendPayoutMode':
        return this.portfolioService.setDividendPayoutMode(
          request.params.id,
          request.params.payoutMode,
          {
            setDefault: request.params.setDefault,
            accountId: request.params.accountId,
            year: request.params.year,
          },
        );
      case 'portfolio.saveLedgerImportPasteImages':
        return saveLedgerImportPasteImages(this.dataDir, request.params.images);
      case 'portfolio.readLedgerImportImagePreviews':
        return readLedgerImportImagePreviews(request.params.sourcePaths);
      case 'portfolio.recognizeLedgerImportScreenshots': {
        this.licenseService.assertFeature('ai_review');
        return this.ledgerAiImportService.recognizeScreenshots(
          request.params.sourcePaths,
          request.params.importAssetKind ?? 'stock',
        );
      }
      case 'portfolio.previewLedgerAiImport':
        return this.ledgerAiImportService.preview(request.params);
      case 'portfolio.commitLedgerAiImport': {
        this.licenseService.assertFeature('ai_review');
        return this.ledgerAiImportService.commit(request.params);
      }
      case 'license.getStatus':
        return this.licenseService.getStatus();
      case 'license.activate':
        return this.licenseService.activate(request.params.code);
      case 'accounts.list':
        return this.accountService.list(request.params.includeArchived);
      case 'accounts.get':
        return this.accountService.get(request.params.id);
      case 'accounts.create':
        return this.accountService.create(request.params);
      case 'accounts.update':
        return this.accountService.update(request.params.id, request.params.input);
      case 'accounts.setDefault':
        return this.accountService.setDefault(request.params.id);
      case 'accounts.archive':
        return this.accountService.archive(request.params.id);
      case 'accounts.delete':
        return this.accountService.delete(request.params.id);
      case 'accounts.listFeeProfiles':
        return this.accountService.listFeeProfiles();
      case 'accounts.estimateFees':
        return this.accountService.estimateFees(request.params);
      case 'accounts.estimateFeesForSymbol':
        return this.accountService.estimateFeesForSymbol(request.params);
      case 'backup.export':
        return this.backupService.exportBackup(request.params);
      case 'backup.import':
        return this.backupService.importBackup(request.params, () => this.database.close());
      case 'episodes.list':
        return this.database.episodes.listEpisodes(request.params.accountId);
      case 'episodes.get':
        return this.database.episodes.getEpisode(request.params.id);
      case 'episodes.addExecution':
        return this.database.episodes.addExecution(request.params);
      case 'import.parseCsv':
        return this.executionImportService.parseCsv(request.params.sourcePath);
      case 'import.previewExecutions':
        return this.executionImportService.preview(request.params);
      case 'import.commitExecutions':
        return this.executionImportService.commit(request.params);
      case 'playbook.list':
        return this.database.playbook.listRules(request.params.status);
      case 'playbook.create':
        return this.database.playbook.createRule(request.params);
      case 'playbook.update':
        return this.database.playbook.updateRule(request.params.id, request.params.input);
      case 'playbook.archive':
        return this.database.playbook.archiveRule(request.params.id);
      case 'playbook.activationChecklist':
        return this.database.playbook.listActivationChecklist(request.params.symbol);
      case 'alerts.listEvents':
        return this.database.alertEvents.listEvents(request.params.limit);
      case 'alerts.setEventAction':
        return this.database.alertEvents.setUserAction(request.params.id, request.params.action);
      case 'alerts.pollActive':
        return pollActiveAlerts(this.database);
      case 'sip.listPlans':
        return this.sipService.listPlans(request.params.statuses);
      case 'sip.getPlan':
        return this.sipService.getPlan(request.params.id);
      case 'sip.createPlan':
        return this.sipService.createPlan(request.params);
      case 'sip.updatePlan':
        return this.sipService.updatePlan(request.params.id, request.params.input);
      case 'sip.setStatus':
        return this.sipService.setPlanStatus(request.params.id, request.params.status);
      case 'sip.deletePlan':
        return this.sipService.deletePlan(request.params.id);
      case 'sip.schedulePause':
        return this.sipService.schedulePlanPause(request.params.id, request.params.fromDate);
      case 'sip.cancelScheduledPause':
        return this.sipService.cancelScheduledPause(request.params.id);
      case 'sip.previewSchedule':
        return this.sipService.previewSchedule(request.params);
      case 'sip.listOccurrences':
        return this.sipService.listOccurrences(request.params.planId, request.params.from, request.params.to);
      case 'sip.listOccurrenceViews':
        return this.sipService.listOccurrenceViews(request.params.planId, request.params.from, request.params.to);
      case 'sip.confirmOccurrence':
        return this.sipService.confirmOccurrence(request.params);
      case 'sip.skipOccurrence':
        return this.sipService.skipOccurrence(request.params.id, request.params.reason);
      case 'sip.getSummary':
        return this.sipService.getSummary();
      case 'sip.scanDue':
        return this.sipService.scanDue();
      case 'sip.getOccurrenceCalendar':
        return this.sipService.getOccurrenceCalendar(request.params.month);
      case 'sip.getPositionMeta':
        return this.sipService.getPositionMeta(request.params.accountId);
      case 'sip.getReviewTemplate':
        return this.sipService.getReviewTemplate(request.params.planId);
      case 'sip.getPlanPositionLink':
        return this.sipService.getPlanPositionLink(request.params.planId);
      case 'sip.listPlansBySymbol':
        return this.sipService.listPlansBySymbol(request.params.accountId, request.params.symbol);
      case 'sip.parseImportCsv':
        return this.sipImportService.parseCsv(request.params.sourcePath);
      case 'sip.previewImport':
        return this.sipImportService.preview(request.params);
      case 'sip.commitImport':
        return this.sipImportService.commit(request.params);
      case 'sip.recognizeImportScreenshot':
        this.licenseService.assertFeature('ai_review');
        return this.sipAiImportService.recognizeScreenshot(request.params.sourcePath);
      case 'sip.previewAiImport':
        return this.sipAiImportService.preview(request.params);
      case 'sip.commitAiImport': {
        this.licenseService.assertFeature('ai_review');
        return this.sipAiImportService.commit(request.params);
      }
      case 'lofArbitrage.listWatchItems':
        return this.lofArbitrageService.listWatchItems();
      case 'lofArbitrage.addWatchItem':
        return this.lofArbitrageService.addWatchItem(request.params.symbol, request.params.notes);
      case 'lofArbitrage.removeWatchItem':
        this.lofArbitrageService.removeWatchItem(request.params.id);
        return { deleted: true as const };
      case 'lofArbitrage.listRules':
        return this.lofArbitrageService.listRules();
      case 'lofArbitrage.createRule':
        return this.lofArbitrageService.createRule(request.params);
      case 'lofArbitrage.setRuleStatus':
        return this.lofArbitrageService.setRuleStatus(request.params.id, request.params.status);
      case 'lofArbitrage.deleteRule':
        this.lofArbitrageService.deleteRule(request.params.id);
        return { deleted: true as const };
      case 'lofArbitrage.getSnapshot':
        return this.lofArbitrageService.getSnapshot(request.params.symbol);
      case 'lofArbitrage.refreshMonitor':
        return this.lofArbitrageService.refreshMonitor();
      case 'lofArbitrage.scanMarket':
        return this.lofArbitrageService.scanMarket(request.params.limit);
      case 'lofArbitrage.listEvents':
        return this.lofArbitrageService.listEvents(request.params.limit);
      case 'lofArbitrage.setEventAction':
        return this.lofArbitrageService.setEventAction(request.params.id, request.params.action);
      case 'lofArbitrage.pollActive':
        return pollLofArbitrage(this.database);
    }
  }

  cancelStream(streamId: string): void {
    this.llmRunner.cancelStream(streamId);
  }

  async handleStream(
    streamId: string,
    method: ServiceStreamMethod,
    params: unknown,
    emit: (event: ServiceStreamEvent) => void,
  ): Promise<void> {
    const emitError = (error: unknown): void => {
      emit({
        type: 'error',
        code: error instanceof LlmError ? error.code : error instanceof LicenseError ? error.code : 'SERVICE_ERROR',
        message: error instanceof Error ? error.message : '未知后台服务错误',
      });
    };

    try {
      switch (method) {
        case 'companyAssistant.askStream': {
          const input = companyAssistantParamsSchema.parse(params);
          this.licenseService.assertFeature('ai_review');
          const result = await generateCompanyAnswerStream(this.llmRunner, input, {
            streamId,
            onChunk: (delta) => emit({ type: 'chunk', delta }),
          });
          emit({ type: 'done', result });
          return;
        }
        case 'reviews.generateAiDraftStream': {
          const input = reviewAiDraftParamsSchema.parse(params);
          this.licenseService.assertFeature('ai_review');
          const result = await generateReviewAiDraftStream(this.database, this.llmRunner, input, {
            streamId,
            onChunk: (delta) => emit({ type: 'chunk', delta }),
          });
          emit({ type: 'done', result });
          return;
        }
        case 'llm.debugRunStream': {
          const parsed = llmDebugRunParamsSchema.parse(params);
          const result = await debugRunStream(this.llmRunner, parsed.promptId, parsed.variables, {
            streamId,
            onChunk: (delta) => emit({ type: 'chunk', delta }),
          });
          emit({ type: 'done', result });
          return;
        }
      }
    } catch (error) {
      emitError(error);
    }
  }
}
