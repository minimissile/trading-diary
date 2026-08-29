import type {
  AssetStats,
  CreateTradeAlertInput,
  CreateTradeReviewInput,
  CreateTradingPlanInput,
  HealthResult,
  ImportedAsset,
  LlmConnectionTestResult,
  LlmDebugRunResult,
  LlmPromptPreview,
  LlmStatusResult,
  LlmUsageSummary,
  LlmUserSettings,
  LicenseActivateResult,
  LicenseStatus,
  QuoteEvaluationResult,
  ReviewAiDraftInput,
  ReviewAiDraftResult,
  TradeAlert,
  TradeAlertStatus,
  TradeReview,
  TradingPlan,
  TradingPlanStatus,
  WorkspaceSnapshot,
  DividendListResult,
  InstrumentInfo,
  KLineAdjust,
  KLineListResult,
  KLinePeriod,
  MarketNewsItem,
  MarketQuote,
  MarketSearchHit,
  MarketSnapshotView,
  WatchlistPoolMeta,
  WatchlistPoolSnapshot,
} from './api.types';
import type {
  AccessLockSettingsView,
  ChangeAccessLockPasswordInput,
  DisableAccessLockInput,
  EnableAccessLockInput,
  VerifyAccessLockResult,
} from './security/access-lock.types';
import type { WatchlistPoolId } from './watchlist/types';
import type {
  CreatePortfolioLedgerInput,
  DividendCalendarDay,
  DividendRecordStatus,
  PortfolioDividendRecord,
  PortfolioPositionView,
  PortfolioRefreshResult,
  PortfolioSummaryView,
} from './portfolio/types';
import type {
  CreateTradingAccountInput,
  FeeEstimateInput,
  FeeEstimateResult,
  FeeProfile,
  TradingAccountSummary,
  UpdateTradingAccountInput,
} from './accounts/types';
import type { PromptId } from './llm/prompt-id';
import type {
  CreateExecutionInput,
  TradeEpisodeView,
} from './episodes/types';
import type {
  CsvParseResult,
  ExecutionImportCommitResult,
  ExecutionImportInput,
  ExecutionImportPreviewResult,
} from './import/types';
import type {
  AlertEvent,
  AlertEventUserAction,
  AlertPollResult,
} from './alerts/event-types';
import type {
  CreatePlaybookRuleInput,
  PlaybookRule,
  PlaybookRuleStatus,
  UpdatePlaybookRuleInput,
} from './playbook/types';
import type {
  ConfirmFundSipOccurrenceInput,
  ConfirmFundSipOccurrenceResult,
  CreateFundSipPlanInput,
  FundSipOccurrence,
  FundSipOccurrencePreview,
  FundSipOccurrenceView,
  FundSipPlanDetailView,
  FundSipPlanView,
  SipOccurrenceCalendarDay,
  SipPlanStatus,
  SipPositionMeta,
  SipReviewTemplate,
  SipPlanPositionLink,
  SipScanResult,
  SipSummaryView,
  UpdateFundSipPlanInput,
} from './sip/types';
import type {
  SipCsvParseResult,
  SipImportCommitResult,
  SipImportInput,
  SipImportPreviewResult,
  SipAiImportInput,
  SipAiImportPreviewResult,
  SipAiRecognizeResult,
} from './sip/import-types';
import type {
  BackupExportInput,
  BackupExportResult,
  BackupImportInput,
  BackupImportResult,
} from './backup/types';

export interface ServiceContract {
  'system.health': {
    params: Record<string, never>;
    result: HealthResult;
  };
  'assets.stats': {
    params: Record<string, never>;
    result: AssetStats;
  };
  'assets.import': {
    params: { sourcePath: string };
    result: ImportedAsset;
  };
  'assets.resolve': {
    params: { hash: string; variant: 'original' | 'preview' };
    result: { filePath: string | null };
  };
  'workspace.snapshot': {
    params: Record<string, never>;
    result: WorkspaceSnapshot;
  };
  'plans.list': {
    params: Record<string, never>;
    result: TradingPlan[];
  };
  'plans.create': {
    params: CreateTradingPlanInput;
    result: TradingPlan;
  };
  'plans.setStatus': {
    params: { id: string; status: TradingPlanStatus };
    result: TradingPlan;
  };
  'alerts.list': {
    params: Record<string, never>;
    result: TradeAlert[];
  };
  'alerts.create': {
    params: CreateTradeAlertInput;
    result: TradeAlert;
  };
  'alerts.setStatus': {
    params: { id: string; status: TradeAlertStatus };
    result: TradeAlert;
  };
  'alerts.evaluatePrice': {
    params: { symbol: string; price: number };
    result: QuoteEvaluationResult;
  };
  'reviews.list': {
    params: Record<string, never>;
    result: TradeReview[];
  };
  'reviews.create': {
    params: CreateTradeReviewInput;
    result: TradeReview;
  };
  'reviews.generateAiDraft': {
    params: ReviewAiDraftInput;
    result: ReviewAiDraftResult;
  };
  'settings.saveLlmApiKey': {
    params: { apiKey: string };
    result: LlmStatusResult;
  };
  'settings.getLlmStatus': {
    params: Record<string, never>;
    result: LlmStatusResult;
  };
  'settings.testLlmConnection': {
    params: Record<string, never>;
    result: LlmConnectionTestResult;
  };
  'settings.getLlmUsage': {
    params: Record<string, never>;
    result: LlmUsageSummary;
  };
  'settings.getLlmSettings': {
    params: Record<string, never>;
    result: LlmUserSettings;
  };
  'settings.saveLlmSettings': {
    params: LlmUserSettings;
    result: LlmUserSettings;
  };
  'settings.getAccessLock': {
    params: Record<string, never>;
    result: AccessLockSettingsView;
  };
  'settings.verifyAccessLock': {
    params: { password: string };
    result: VerifyAccessLockResult;
  };
  'settings.enableAccessLock': {
    params: EnableAccessLockInput;
    result: AccessLockSettingsView;
  };
  'settings.enableExistingAccessLock': {
    params: Record<string, never>;
    result: AccessLockSettingsView;
  };
  'settings.disableAccessLock': {
    params: DisableAccessLockInput;
    result: AccessLockSettingsView;
  };
  'settings.changeAccessLockPassword': {
    params: ChangeAccessLockPasswordInput;
    result: AccessLockSettingsView;
  };
  'llm.previewPrompt': {
    params: { promptId: PromptId; variables: Record<string, string> };
    result: LlmPromptPreview;
  };
  'market.resolve': {
    params: { symbol: string };
    result: InstrumentInfo;
  };
  'market.search': {
    params: { query: string; limit?: number };
    result: MarketSearchHit[];
  };
  'market.getQuote': {
    params: { symbol: string };
    result: MarketQuote;
  };
  'market.getQuotes': {
    params: { symbols: string[] };
    result: MarketQuote[];
  };
  'market.getSnapshot': {
    params: { symbol: string };
    result: MarketSnapshotView;
  };
  'market.listDividends': {
    params: { symbol: string; page?: number; pageSize?: number };
    result: DividendListResult;
  };
  'market.listNews': {
    params: { symbol: string; pageSize?: number };
    result: MarketNewsItem[];
  };
  'market.listKlines': {
    params: { symbol: string; period?: KLinePeriod; adjust?: KLineAdjust; limit?: number };
    result: KLineListResult;
  };
  'watchlist.listPools': {
    params: Record<string, never>;
    result: WatchlistPoolMeta[];
  };
  'watchlist.getPoolSnapshot': {
    params: { poolId: WatchlistPoolId };
    result: WatchlistPoolSnapshot;
  };
  'portfolio.listPositions': {
    params: { accountId?: string };
    result: PortfolioPositionView[];
  };
  'portfolio.getSummary': {
    params: { accountId?: string; year?: number };
    result: PortfolioSummaryView;
  };
  'portfolio.getDividendCalendar': {
    params: { accountId?: string; month: string };
    result: DividendCalendarDay[];
  };
  'portfolio.listDividends': {
    params: { accountId?: string; year?: number; statuses?: DividendRecordStatus[] };
    result: PortfolioDividendRecord[];
  };
  'portfolio.addLedgerEntry': {
    params: CreatePortfolioLedgerInput;
    result: PortfolioPositionView[];
  };
  'portfolio.listLedgerEntries': {
    params: { accountId?: string; symbol?: string };
    result: import('./portfolio/types').PortfolioLedgerEntry[];
  };
  'portfolio.getRealizedHistory': {
    params: { accountId?: string; year?: number };
    result: import('./portfolio/types').PortfolioRealizedHistoryView;
  };
  'portfolio.updateLedgerEntry': {
    params: { id: string; input: import('./portfolio/types').UpdatePortfolioLedgerInput };
    result: import('./portfolio/types').PortfolioLedgerEntry;
  };
  'portfolio.deleteLedgerEntry': {
    params: { id: string };
    result: PortfolioPositionView[];
  };
  'portfolio.deletePosition': {
    params: { accountId?: string; symbol: string };
    result: PortfolioPositionView[];
  };
  'portfolio.confirmDividend': {
    params: { id: string; confirmed: boolean; cashAmount?: number; accountId?: string; year?: number };
    result: PortfolioDividendRecord[];
  };
  'portfolio.refreshDividends': {
    params: { accountId?: string; symbol?: string };
    result: PortfolioRefreshResult;
  };
  'portfolio.syncMarketQuotes': {
    params: { accountId?: string };
    result: PortfolioPositionView[];
  };
  'portfolio.getDividendGoal': {
    params: { accountId?: string };
    result: import('./portfolio/dividend-goal').DividendGoalSettings | null;
  };
  'portfolio.saveDividendGoal': {
    params: {
      accountId?: string;
      settings: import('./portfolio/dividend-goal').DividendGoalSettings | null;
    };
    result: import('./portfolio/dividend-goal').DividendGoalSettings | null;
  };
  'license.getStatus': {
    params: Record<string, never>;
    result: LicenseStatus;
  };
  'license.activate': {
    params: { code: string };
    result: LicenseActivateResult;
  };
  'accounts.list': {
    params: { includeArchived?: boolean };
    result: TradingAccountSummary[];
  };
  'accounts.get': {
    params: { id: string };
    result: TradingAccountSummary;
  };
  'accounts.create': {
    params: CreateTradingAccountInput;
    result: TradingAccountSummary;
  };
  'accounts.update': {
    params: { id: string; input: UpdateTradingAccountInput };
    result: TradingAccountSummary;
  };
  'accounts.setDefault': {
    params: { id: string };
    result: TradingAccountSummary;
  };
  'accounts.archive': {
    params: { id: string };
    result: TradingAccountSummary;
  };
  'accounts.delete': {
    params: { id: string };
    result: void;
  };
  'accounts.listFeeProfiles': {
    params: Record<string, never>;
    result: FeeProfile[];
  };
  'accounts.estimateFees': {
    params: FeeEstimateInput;
    result: FeeEstimateResult;
  };
  'accounts.estimateFeesForSymbol': {
    params: {
      accountId?: string;
      feeProfileId?: string;
      side: 'buy' | 'sell';
      symbol: string;
      price: number;
      quantity: number;
    };
    result: FeeEstimateResult;
  };
  'backup.export': {
    params: BackupExportInput;
    result: BackupExportResult;
  };
  'backup.import': {
    params: BackupImportInput;
    result: BackupImportResult;
  };
  'episodes.list': {
    params: { accountId?: string };
    result: TradeEpisodeView[];
  };
  'episodes.get': {
    params: { id: string };
    result: TradeEpisodeView;
  };
  'episodes.addExecution': {
    params: CreateExecutionInput;
    result: TradeEpisodeView;
  };
  'import.parseCsv': {
    params: { sourcePath: string };
    result: CsvParseResult;
  };
  'import.previewExecutions': {
    params: ExecutionImportInput;
    result: ExecutionImportPreviewResult;
  };
  'import.commitExecutions': {
    params: ExecutionImportInput;
    result: ExecutionImportCommitResult;
  };
  'playbook.list': {
    params: { status?: PlaybookRuleStatus };
    result: PlaybookRule[];
  };
  'playbook.create': {
    params: CreatePlaybookRuleInput;
    result: PlaybookRule;
  };
  'playbook.update': {
    params: { id: string; input: UpdatePlaybookRuleInput };
    result: PlaybookRule;
  };
  'playbook.archive': {
    params: { id: string };
    result: PlaybookRule;
  };
  'playbook.activationChecklist': {
    params: { symbol?: string };
    result: PlaybookRule[];
  };
  'alerts.listEvents': {
    params: { limit?: number };
    result: AlertEvent[];
  };
  'alerts.setEventAction': {
    params: { id: string; action: AlertEventUserAction };
    result: AlertEvent;
  };
  'alerts.pollActive': {
    params: Record<string, never>;
    result: AlertPollResult;
  };
  'sip.listPlans': {
    params: { statuses?: SipPlanStatus[] };
    result: FundSipPlanView[];
  };
  'sip.getPlan': {
    params: { id: string };
    result: FundSipPlanDetailView;
  };
  'sip.createPlan': {
    params: CreateFundSipPlanInput;
    result: FundSipPlanView;
  };
  'sip.updatePlan': {
    params: { id: string; input: UpdateFundSipPlanInput };
    result: FundSipPlanView;
  };
  'sip.setStatus': {
    params: { id: string; status: SipPlanStatus };
    result: FundSipPlanView;
  };
  'sip.previewSchedule': {
    params: CreateFundSipPlanInput;
    result: FundSipOccurrencePreview[];
  };
  'sip.listOccurrences': {
    params: { planId?: string; from?: string; to?: string };
    result: FundSipOccurrence[];
  };
  'sip.listOccurrenceViews': {
    params: { planId?: string; from?: string; to?: string };
    result: FundSipOccurrenceView[];
  };
  'sip.confirmOccurrence': {
    params: ConfirmFundSipOccurrenceInput;
    result: ConfirmFundSipOccurrenceResult;
  };
  'sip.skipOccurrence': {
    params: { id: string; reason: string };
    result: FundSipOccurrence;
  };
  'sip.getSummary': {
    params: Record<string, never>;
    result: SipSummaryView;
  };
  'sip.scanDue': {
    params: Record<string, never>;
    result: SipScanResult;
  };
  'sip.getOccurrenceCalendar': {
    params: { month: string };
    result: SipOccurrenceCalendarDay[];
  };
  'sip.getPositionMeta': {
    params: { accountId?: string };
    result: SipPositionMeta[];
  };
  'sip.getReviewTemplate': {
    params: { planId: string };
    result: SipReviewTemplate;
  };
  'sip.getPlanPositionLink': {
    params: { planId: string };
    result: SipPlanPositionLink;
  };
  'sip.listPlansBySymbol': {
    params: { accountId: string; symbol: string };
    result: FundSipPlanView[];
  };
  'sip.parseImportCsv': {
    params: { sourcePath: string };
    result: SipCsvParseResult;
  };
  'sip.previewImport': {
    params: SipImportInput;
    result: SipImportPreviewResult;
  };
  'sip.commitImport': {
    params: SipImportInput;
    result: SipImportCommitResult;
  };
  'sip.recognizeImportScreenshot': {
    params: { sourcePath: string };
    result: SipAiRecognizeResult;
  };
  'sip.previewAiImport': {
    params: SipAiImportInput;
    result: SipAiImportPreviewResult;
  };
  'sip.commitAiImport': {
    params: SipAiImportInput;
    result: SipImportCommitResult;
  };
}

export type ServiceStreamMethod = 'reviews.generateAiDraftStream' | 'llm.debugRunStream';

export type ServiceStreamParams = {
  'reviews.generateAiDraftStream': ReviewAiDraftInput;
  'llm.debugRunStream': { promptId: PromptId; variables: Record<string, string> };
};

export type ServiceStreamResult = {
  'reviews.generateAiDraftStream': ReviewAiDraftResult;
  'llm.debugRunStream': LlmDebugRunResult;
};

export type ServiceStreamChunk = { type: 'chunk'; delta: string };
export type ServiceStreamDone = { type: 'done'; result: unknown };
export type ServiceStreamError = { type: 'error'; code: string; message: string };
export type ServiceStreamEvent = ServiceStreamChunk | ServiceStreamDone | ServiceStreamError;

export type ServiceMethod = keyof ServiceContract;

export type ServiceRequest<M extends ServiceMethod = ServiceMethod> = {
  [K in M]: {
    id: string;
    method: K;
    params: ServiceContract[K]['params'];
  };
}[M];

export type ServiceResponse =
  { id: string; ok: true; data: unknown } | { id: string; ok: false; error: { code: string; message: string } };

export type MainToServiceMessage =
  | { type: 'service:init'; dataDir: string; appVersion: string }
  | { type: 'service:request'; request: ServiceRequest }
  | { type: 'service:stream-request'; streamId: string; method: ServiceStreamMethod; params: unknown }
  | { type: 'service:stream-cancel'; streamId: string }
  | { type: 'service:shutdown' };

export type ServiceToMainMessage =
  | { type: 'service:ready' }
  | { type: 'service:response'; response: ServiceResponse }
  | { type: 'service:stream-event'; streamId: string; event: ServiceStreamEvent }
  | { type: 'service:fatal'; message: string };
