import type { AlertEvent, AlertEventUserAction } from './alerts/event-types';
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
  SipPlanPositionLink,
  SipPlanStatus,
  SipPositionMeta,
  SipReviewTemplate,
  SipScanResult,
  SipSchedulePauseResult,
  SipSummaryView,
  UpdateFundSipPlanInput,
} from './sip/types';
import type {
  CreateLofArbitrageRuleInput,
  LofArbitrageAlertEvent,
  LofArbitrageMonitorResult,
  LofArbitrageRule,
  LofArbitrageRuleStatus,
  LofArbitrageScanResult,
  LofArbitrageSnapshot,
  LofWatchItem,
} from './lof-arbitrage/types';
import type { AccessLockSettingsView, VerifyAccessLockResult } from './security/access-lock.types';
import type {
  CreatePortfolioLedgerInput,
  DividendCalendarDay,
  DividendRecordStatus,
  PortfolioDividendRecord,
  PortfolioLedgerEntry,
  PortfolioPnlCalendarSyncResult,
  PortfolioPnlCalendarView,
  PortfolioPositionView,
  PortfolioRealizedHistoryView,
  PortfolioRefreshResult,
  PortfolioSummaryView,
  UpdatePortfolioLedgerInput,
} from './portfolio/types';
import type { DividendGoalSettings } from './portfolio/dividend-goal';
import type { DividendPayoutMode } from './portfolio/dividend-payout';
import type {
  LedgerAiImportAssetKind,
  LedgerAiImportInput,
  LedgerAiImportPreviewResult,
  LedgerAiRecognizeResult,
  LedgerImportCommitResult,
} from './portfolio/ledger-import-types';
import type { LicenseActivateResult, LicenseStatus } from './license/types';
import type { BackupExportResult, BackupImportResult } from './backup/types';
import type { CreatePlaybookRuleInput, PlaybookRule, PlaybookRuleStatus, UpdatePlaybookRuleInput } from './playbook/types';
import type {
  SipAiImportInput,
  SipAiImportPreviewResult,
  SipAiRecognizeResult,
  SipCsvParseResult,
  SipImportCommitResult,
  SipImportInput,
  SipImportPreviewResult,
} from './sip/import-types';
export interface HealthResult {
  servicePid: number;
  startedAt: string;
  sqliteVersion: string;
  schemaVersion: number;
  storageReady: boolean;
}

export interface AssetStats {
  count: number;
  originalBytes: number;
  previewBytes: number;
}

export interface ImportedAsset {
  hash: string;
  mediaType: string;
  width: number | null;
  height: number | null;
  originalBytes: number;
  previewUrl: string;
  duplicate: boolean;
}

export type TradeDirection = 'long' | 'short';
export type TradingPlanStatus = 'draft' | 'watching' | 'holding' | 'completed' | 'cancelled';

export interface TradingPlan {
  id: string;
  symbol: string;
  name: string;
  direction: TradeDirection;
  thesis: string;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number | null;
  riskAmount: number;
  status: TradingPlanStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTradingPlanInput {
  symbol: string;
  name: string;
  direction: TradeDirection;
  thesis: string;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number | null;
  riskAmount: number;
  activateNow: boolean;
}

export type TradeAlertCondition = 'at_or_above' | 'at_or_below';
export type TradeAlertRole = 'entry' | 'stop' | 'target' | 'custom';
export type TradeAlertStatus = 'active' | 'triggered' | 'completed' | 'disabled';

export interface TradeAlert {
  id: string;
  planId: string | null;
  symbol: string;
  title: string;
  condition: TradeAlertCondition;
  role: TradeAlertRole;
  targetPrice: number;
  lastPrice: number | null;
  status: TradeAlertStatus;
  triggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTradeAlertInput {
  symbol: string;
  title: string;
  condition: TradeAlertCondition;
  targetPrice: number;
}

export interface QuoteEvaluationResult {
  symbol: string;
  price: number;
  evaluatedCount: number;
  newlyTriggered: TradeAlert[];
  newlyTriggeredEvents: AlertEvent[];
}

export interface TradeReview {
  id: string;
  planId: string | null;
  episodeId: string | null;
  symbol: string;
  title: string;
  direction: TradeDirection;
  planned: boolean;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  fees: number;
  pnl: number;
  executionScore: number;
  summary: string;
  lesson: string;
  createdAt: string;
}

export interface CreateTradeReviewInput {
  planId: string | null;
  episodeId?: string | null;
  symbol: string;
  title: string;
  direction: TradeDirection;
  planned: boolean;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  fees: number;
  executionScore: number;
  summary: string;
  lesson: string;
  saveToPlaybook?: boolean;
}

import type { TradeEpisodeView, CreateExecutionInput } from './episodes/types';
import type {
  CsvParseResult,
  ExecutionImportCommitResult,
  ExecutionImportInput,
  ExecutionImportPreviewResult,
} from './import/types';

export interface WorkspaceSnapshot {
  activePlanCount: number;
  triggeredAlertCount: number;
  pendingReviewCount: number;
  openEpisodeCount: number;
  reviewedTradeCount: number;
  totalPnl: number;
  averageExecutionScore: number | null;
  activePlans: TradingPlan[];
  triggeredAlerts: TradeAlert[];
  pendingReviewPlans: TradingPlan[];
  pendingReviewEpisodes: TradeEpisodeView[];
  recentReviews: TradeReview[];
  dueSipOccurrences: FundSipOccurrenceView[];
  activeSipPlanCount: number;
  dueSipOccurrenceCount: number;
  lofArbitrageOpportunities: LofArbitrageSnapshot[];
  lofArbitrageTriggeredCount: number;
}

export type UpdatePhase =
  'disabled' | 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';

export type UpdateDeliveryMode = 'automatic' | 'manual';

/** 更新模块对渲染进程公开的稳定状态，避免暴露具体更新框架对象。 */
export interface UpdateState {
  phase: UpdatePhase;
  deliveryMode: UpdateDeliveryMode;
  currentVersion: string;
  availableVersion: string | null;
  downloadPercent: number | null;
  message: string | null;
}

export type { LicenseActivateResult, LicenseFeature, LicenseSource, LicenseStatus, LicenseTier } from './license/types';

export type {
  AccountBroker,
  AccountCustomFeeInput,
  AccountKind,
  CreateTradingAccountInput,
  FeeEstimateInput,
  FeeEstimateResult,
  FeeProfile,
  TradingAccount,
  TradingAccountSummary,
  UpdateTradingAccountInput,
} from './accounts/types';

import type {
  CreateTradingAccountInput,
  FeeEstimateInput,
  FeeEstimateResult,
  FeeProfile,
  TradingAccountSummary,
  UpdateTradingAccountInput,
} from './accounts/types';

export interface ReviewAiDraftInput {
  planId: string | null;
  symbol: string;
  title: string;
  direction: TradeDirection;
  planned: boolean;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  fees: number;
  executionScore: number;
  partialSummary?: string;
  partialLesson?: string;
}

export interface ReviewAiDraftResult {
  summary: string;
  lesson: string;
  citations: string[];
}

export interface LlmStatusResult {
  configured: boolean;
}

export interface LlmConnectionTestResult {
  ok: boolean;
  model: string;
  latencyMs: number;
}

export interface LlmUserSettings {
  monthlyTokenBudget: number | null;
  debugLogging: boolean;
}

export interface LlmUsageRecord {
  id: string;
  timestamp: string;
  promptId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface LlmUsageSummary {
  month: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  requestCount: number;
  monthlyTokenBudget: number | null;
  budgetRemaining: number | null;
  budgetExceeded: boolean;
  recentRecords: LlmUsageRecord[];
}

export interface LlmPromptPreview {
  promptId: string;
  promptVersion: number;
  system: string;
  user: string;
}

export interface LlmDebugRunResult {
  content: string;
  model: string;
  promptId: string;
  promptVersion: number;
  latencyMs: number;
  usage?: { inputTokens: number; outputTokens: number };
}

export type LlmStreamEventType = 'chunk' | 'done' | 'error';

export interface LlmStreamPayload {
  streamId: string;
  type: LlmStreamEventType;
  delta?: string;
  result?: ReviewAiDraftResult | LlmDebugRunResult;
  code?: string;
  message?: string;
}

import type {
  DividendEvent,
  DividendListResult,
  InstrumentInfo,
  KLineAdjust,
  KLineListResult,
  KLinePeriod,
  MarketNewsItem,
  MarketQuote,
  MarketSearchHit,
} from './market/types';

export type {
  DividendEvent,
  DividendListResult,
  InstrumentInfo,
  InstrumentKind,
  KLineAdjust,
  KLineBar,
  KLineListResult,
  KLinePeriod,
  MarketNewsItem,
  MarketQuote,
  MarketSearchHit,
  MarketSnapshot,
} from './market/types';

export interface MarketSnapshotView {
  instrument: InstrumentInfo;
  quote: MarketQuote;
  upcomingDividends: DividendEvent[];
}

export type {
  DividendPoolItemLive,
  DividendStabilityGrade,
  GrowthPoolItemLive,
  OverlapPoolItemLive,
  WatchlistPoolId,
  WatchlistPoolMeta,
  WatchlistPoolSnapshot,
} from './watchlist/types';

import type { WatchlistPoolId, WatchlistPoolMeta, WatchlistPoolSnapshot } from './watchlist/types';

export type {
  CreateExecutionInput,
  Execution,
  ExecutionSide,
  ExecutionSource,
  TradeEpisodeStatus,
  TradeEpisodeView,
} from './episodes/types';

export type {
  CreatePortfolioLedgerInput,
  DividendCalendarDay,
  DividendRecordStatus,
  MilestoneState,
  PortfolioDividendRecord,
  PortfolioLedgerSide,
  PortfolioPositionView,
  PortfolioRefreshResult,
  PortfolioSummaryView,
} from './portfolio/types';

export type {
  CsvParseResult,
  ExecutionColumnMapping,
  ExecutionCsvField,
  ExecutionImportCommitResult,
  ExecutionImportInput,
  ExecutionImportPreviewResult,
  ExecutionImportPreviewRow,
} from './import/types';

export type {
  BackupExportInput,
  BackupExportResult,
  BackupImportInput,
  BackupImportResult,
  BackupManifest,
  BackupStats,
} from './backup/types';

export interface DesktopApi {
  system: {
    health: () => Promise<HealthResult>;
    openExternal: (url: string) => Promise<void>;
  };
  assets: {
    stats: () => Promise<AssetStats>;
    importImage: () => Promise<ImportedAsset | null>;
  };
  workspace: {
    snapshot: () => Promise<WorkspaceSnapshot>;
    onChanged: (listener: () => void) => () => void;
  };
  plans: {
    list: () => Promise<TradingPlan[]>;
    create: (input: CreateTradingPlanInput) => Promise<TradingPlan>;
    setStatus: (id: string, status: TradingPlanStatus) => Promise<TradingPlan>;
  };
  alerts: {
    list: () => Promise<TradeAlert[]>;
    create: (input: CreateTradeAlertInput) => Promise<TradeAlert>;
    setStatus: (id: string, status: TradeAlertStatus) => Promise<TradeAlert>;
    evaluatePrice: (symbol: string, price: number) => Promise<QuoteEvaluationResult>;
    listEvents: (limit?: number) => Promise<AlertEvent[]>;
    setEventAction: (id: string, action: AlertEventUserAction) => Promise<AlertEvent>;
  };
  reviews: {
    list: () => Promise<TradeReview[]>;
    create: (input: CreateTradeReviewInput) => Promise<TradeReview>;
    generateAiDraft: (input: ReviewAiDraftInput) => Promise<ReviewAiDraftResult>;
    generateAiDraftStream: (
      input: ReviewAiDraftInput,
      listeners: {
        onChunk: (delta: string) => void;
        onDone: (result: ReviewAiDraftResult) => void;
        onError: (error: { code: string; message: string }) => void;
      },
    ) => Promise<{ streamId: string; cancel: () => void }>;
  };
  settings: {
    getLlmStatus: () => Promise<LlmStatusResult>;
    saveLlmApiKey: (apiKey: string) => Promise<LlmStatusResult>;
    testLlmConnection: () => Promise<LlmConnectionTestResult>;
    getLlmUsage: () => Promise<LlmUsageSummary>;
    getLlmSettings: () => Promise<LlmUserSettings>;
    saveLlmSettings: (settings: LlmUserSettings) => Promise<LlmUserSettings>;
    getAccessLock: () => Promise<AccessLockSettingsView>;
    verifyAccessLock: (password: string) => Promise<VerifyAccessLockResult>;
    enableAccessLock: (newPassword: string) => Promise<AccessLockSettingsView>;
    enableExistingAccessLock: () => Promise<AccessLockSettingsView>;
    disableAccessLock: (password: string) => Promise<AccessLockSettingsView>;
    changeAccessLockPassword: (currentPassword: string, newPassword: string) => Promise<AccessLockSettingsView>;
  };
  llm: {
    previewPrompt: (promptId: string, variables: Record<string, string>) => Promise<LlmPromptPreview>;
    debugRunStream: (
      promptId: string,
      variables: Record<string, string>,
      listeners: {
        onChunk: (delta: string) => void;
        onDone: (result: LlmDebugRunResult) => void;
        onError: (error: { code: string; message: string }) => void;
      },
    ) => Promise<{ streamId: string; cancel: () => void }>;
  };
  updater: {
    getState: () => Promise<UpdateState>;
    check: () => Promise<UpdateState>;
    download: () => Promise<UpdateState>;
    install: () => Promise<void>;
    openReleasePage: () => Promise<void>;
    onStateChanged: (listener: (state: UpdateState) => void) => () => void;
  };
  market: {
    resolve: (symbol: string) => Promise<InstrumentInfo>;
    search: (query: string, limit?: number, marketScopes?: string[], assetKind?: 'stock' | 'fund') => Promise<MarketSearchHit[]>;
    getQuote: (symbol: string) => Promise<MarketQuote>;
    getQuotes: (symbols: string[]) => Promise<MarketQuote[]>;
    getSnapshot: (symbol: string) => Promise<MarketSnapshotView>;
    listDividends: (symbol: string, page?: number, pageSize?: number) => Promise<DividendListResult>;
    listNews: (symbol: string, pageSize?: number) => Promise<MarketNewsItem[]>;
    listKlines: (
      symbol: string,
      period?: KLinePeriod,
      adjust?: KLineAdjust,
      limit?: number,
      beforeTimestamp?: number,
    ) => Promise<KLineListResult>;
  };
  watchlist: {
    listPools: () => Promise<WatchlistPoolMeta[]>;
    getPoolSnapshot: (poolId: WatchlistPoolId) => Promise<WatchlistPoolSnapshot>;
  };
  tradeSnapshot: {
    cancel: () => Promise<void>;
    open: (input: import('./chart/trade-snapshot').TradeSnapshotInput) => Promise<string>;
    payload: () => Promise<import('./chart/trade-snapshot').TradeSnapshotPayload>;
    ready: (error?: string) => Promise<void>;
  };
  portfolio: {
    listPositions: (accountId?: string) => Promise<PortfolioPositionView[]>;
    getSummary: (accountId?: string, year?: number) => Promise<PortfolioSummaryView>;
    getDividendCalendar: (accountId: string | undefined, month: string) => Promise<DividendCalendarDay[]>;
    listDividends: (accountId?: string, year?: number, statuses?: DividendRecordStatus[]) => Promise<PortfolioDividendRecord[]>;
    addLedgerEntry: (input: CreatePortfolioLedgerInput) => Promise<PortfolioPositionView[]>;
    listLedgerEntries: (accountId?: string, symbol?: string) => Promise<PortfolioLedgerEntry[]>;
    getRealizedHistory: (accountId?: string, year?: number) => Promise<PortfolioRealizedHistoryView>;
    getPnlCalendar: (accountId?: string, month?: string) => Promise<PortfolioPnlCalendarView>;
    syncPnlCalendarBars: (accountId?: string) => Promise<PortfolioPnlCalendarSyncResult>;
    syncPnlCalendarBar: (accountId: string | undefined, symbol: string) => Promise<PortfolioPnlCalendarSyncResult>;
    updateLedgerEntry: (id: string, input: UpdatePortfolioLedgerInput) => Promise<PortfolioLedgerEntry>;
    deleteLedgerEntry: (id: string) => Promise<PortfolioPositionView[]>;
    deletePosition: (accountId: string | undefined, symbol: string) => Promise<PortfolioPositionView[]>;
    confirmDividend: (
      id: string,
      confirmed: boolean,
      cashAmount?: number,
      accountId?: string,
      year?: number,
    ) => Promise<PortfolioDividendRecord[]>;
    refreshDividends: (accountId?: string, symbol?: string) => Promise<PortfolioRefreshResult>;
    syncMarketQuotes: (accountId?: string) => Promise<PortfolioPositionView[]>;
    getDividendGoal: (accountId?: string) => Promise<DividendGoalSettings | null>;
    saveDividendGoal: (
      accountId: string | undefined,
      settings: DividendGoalSettings | null,
    ) => Promise<DividendGoalSettings | null>;
    getDividendPayoutDefault: (accountId: string, symbol: string) => Promise<DividendPayoutMode | null>;
    setDividendPayoutMode: (
      id: string,
      payoutMode: DividendPayoutMode,
      setDefault?: boolean,
      accountId?: string,
      year?: number,
    ) => Promise<PortfolioDividendRecord[]>;
    selectLedgerImportScreenshots: () => Promise<{ sourcePaths: string[]; fileNames: string[] } | null>;
    saveLedgerImportPasteImages: (
      images: Array<{ data: string; mimeType: string }>,
    ) => Promise<{ sourcePaths: string[]; fileNames: string[] }>;
    readLedgerImportImagePreviews: (sourcePaths: string[]) => Promise<string[]>;
    recognizeLedgerImportScreenshots: (
      sourcePaths: string[],
      importAssetKind?: LedgerAiImportAssetKind,
    ) => Promise<LedgerAiRecognizeResult>;
    previewLedgerAiImport: (input: LedgerAiImportInput) => Promise<LedgerAiImportPreviewResult>;
    commitLedgerAiImport: (input: LedgerAiImportInput) => Promise<LedgerImportCommitResult>;
  };
  license: {
    getStatus: () => Promise<LicenseStatus>;
    activate: (code: string) => Promise<LicenseActivateResult>;
  };
  accounts: {
    list: (includeArchived?: boolean) => Promise<TradingAccountSummary[]>;
    get: (id: string) => Promise<TradingAccountSummary>;
    create: (input: CreateTradingAccountInput) => Promise<TradingAccountSummary>;
    update: (id: string, input: UpdateTradingAccountInput) => Promise<TradingAccountSummary>;
    setDefault: (id: string) => Promise<TradingAccountSummary>;
    archive: (id: string) => Promise<TradingAccountSummary>;
    delete: (id: string) => Promise<void>;
    listFeeProfiles: () => Promise<FeeProfile[]>;
    estimateFees: (input: FeeEstimateInput) => Promise<FeeEstimateResult>;
    estimateFeesForSymbol: (input: {
      accountId?: string;
      feeProfileId?: string;
      side: 'buy' | 'sell';
      symbol: string;
      price: number;
      quantity: number;
    }) => Promise<FeeEstimateResult>;
  };
  backup: {
    export: (options?: { includeLicense?: boolean }) => Promise<BackupExportResult | null>;
    import: () => Promise<BackupImportResult | null>;
    relaunchApp: () => Promise<void>;
  };
  episodes: {
    list: (accountId?: string) => Promise<TradeEpisodeView[]>;
    get: (id: string) => Promise<TradeEpisodeView>;
    addExecution: (input: CreateExecutionInput) => Promise<TradeEpisodeView>;
  };
  import: {
    selectCsvFile: () => Promise<CsvParseResult | null>;
    previewExecutions: (input: ExecutionImportInput) => Promise<ExecutionImportPreviewResult>;
    commitExecutions: (input: ExecutionImportInput) => Promise<ExecutionImportCommitResult>;
  };
  playbook: {
    list: (status?: PlaybookRuleStatus) => Promise<PlaybookRule[]>;
    create: (input: CreatePlaybookRuleInput) => Promise<PlaybookRule>;
    update: (id: string, input: UpdatePlaybookRuleInput) => Promise<PlaybookRule>;
    archive: (id: string) => Promise<PlaybookRule>;
    activationChecklist: (symbol?: string) => Promise<PlaybookRule[]>;
  };
  sip: {
    listPlans: (statuses?: SipPlanStatus[]) => Promise<FundSipPlanView[]>;
    getPlan: (id: string) => Promise<FundSipPlanDetailView>;
    create: (input: CreateFundSipPlanInput) => Promise<FundSipPlanView>;
    update: (id: string, input: UpdateFundSipPlanInput) => Promise<FundSipPlanView>;
    setStatus: (id: string, status: SipPlanStatus) => Promise<FundSipPlanView>;
    delete: (id: string) => Promise<{ deleted: true }>;
    deletePlan: (id: string) => Promise<{ deleted: true }>;
    schedulePause: (id: string, fromDate: string) => Promise<SipSchedulePauseResult>;
    cancelScheduledPause: (id: string) => Promise<FundSipPlanView>;
    previewSchedule: (input: CreateFundSipPlanInput) => Promise<FundSipOccurrencePreview[]>;
    listOccurrences: (planId?: string, from?: string, to?: string) => Promise<FundSipOccurrence[]>;
    listOccurrenceViews: (planId?: string, from?: string, to?: string) => Promise<FundSipOccurrenceView[]>;
    confirmOccurrence: (input: ConfirmFundSipOccurrenceInput) => Promise<ConfirmFundSipOccurrenceResult>;
    skipOccurrence: (id: string, reason: string) => Promise<FundSipOccurrence>;
    getSummary: () => Promise<SipSummaryView>;
    scanDue: () => Promise<SipScanResult>;
    getOccurrenceCalendar: (month: string) => Promise<SipOccurrenceCalendarDay[]>;
    getPositionMeta: (accountId?: string) => Promise<SipPositionMeta[]>;
    getReviewTemplate: (planId: string) => Promise<SipReviewTemplate>;
    getPlanPositionLink: (planId: string) => Promise<SipPlanPositionLink>;
    listPlansBySymbol: (accountId: string, symbol: string) => Promise<FundSipPlanView[]>;
    parseImportCsv: (sourcePath: string) => Promise<SipCsvParseResult>;
    previewImport: (input: SipImportInput) => Promise<SipImportPreviewResult>;
    commitImport: (input: SipImportInput) => Promise<SipImportCommitResult>;
    selectImportScreenshot: () => Promise<{ sourcePath: string; fileName: string } | null>;
    recognizeImportScreenshot: (sourcePath: string) => Promise<SipAiRecognizeResult>;
    previewAiImport: (input: SipAiImportInput) => Promise<SipAiImportPreviewResult>;
    commitAiImport: (input: SipAiImportInput) => Promise<SipImportCommitResult>;
  };
  lofArbitrage: {
    listWatchItems: () => Promise<LofWatchItem[]>;
    addWatchItem: (symbol: string, notes?: string | null) => Promise<LofWatchItem>;
    removeWatchItem: (id: string) => Promise<{ deleted: true }>;
    listRules: () => Promise<LofArbitrageRule[]>;
    createRule: (input: CreateLofArbitrageRuleInput) => Promise<LofArbitrageRule>;
    setRuleStatus: (id: string, status: LofArbitrageRuleStatus) => Promise<LofArbitrageRule>;
    deleteRule: (id: string) => Promise<{ deleted: true }>;
    getSnapshot: (symbol: string) => Promise<LofArbitrageSnapshot>;
    refreshMonitor: () => Promise<LofArbitrageMonitorResult>;
    scanMarket: (limit?: number) => Promise<LofArbitrageScanResult>;
    listEvents: (limit?: number) => Promise<LofArbitrageAlertEvent[]>;
    setEventAction: (id: string, action: 'acknowledged' | 'dismissed') => Promise<LofArbitrageAlertEvent>;
  };
}
