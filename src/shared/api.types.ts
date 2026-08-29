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
  newlyTriggeredEvents: import('./alerts/event-types').AlertEvent[];
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
  dueSipOccurrences: import('./sip/types').FundSipOccurrenceView[];
  activeSipPlanCount: number;
  dueSipOccurrenceCount: number;
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

export type {
  LicenseActivateResult,
  LicenseFeature,
  LicenseSource,
  LicenseStatus,
  LicenseTier,
} from './license/types';

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
    listEvents: (limit?: number) => Promise<import('./alerts/event-types').AlertEvent[]>;
    setEventAction: (id: string, action: import('./alerts/event-types').AlertEventUserAction) => Promise<import('./alerts/event-types').AlertEvent>;
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
    getAccessLock: () => Promise<import('./security/access-lock.types').AccessLockSettingsView>;
    verifyAccessLock: (password: string) => Promise<import('./security/access-lock.types').VerifyAccessLockResult>;
    enableAccessLock: (newPassword: string) => Promise<import('./security/access-lock.types').AccessLockSettingsView>;
    enableExistingAccessLock: () => Promise<import('./security/access-lock.types').AccessLockSettingsView>;
    disableAccessLock: (password: string) => Promise<import('./security/access-lock.types').AccessLockSettingsView>;
    changeAccessLockPassword: (
      currentPassword: string,
      newPassword: string,
    ) => Promise<import('./security/access-lock.types').AccessLockSettingsView>;
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
    search: (query: string, limit?: number) => Promise<MarketSearchHit[]>;
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
    ) => Promise<KLineListResult>;
  };
  watchlist: {
    listPools: () => Promise<WatchlistPoolMeta[]>;
    getPoolSnapshot: (poolId: WatchlistPoolId) => Promise<WatchlistPoolSnapshot>;
  };
  portfolio: {
    listPositions: (accountId?: string) => Promise<import('./portfolio/types').PortfolioPositionView[]>;
    getSummary: (accountId?: string, year?: number) => Promise<import('./portfolio/types').PortfolioSummaryView>;
    getDividendCalendar: (accountId: string | undefined, month: string) => Promise<import('./portfolio/types').DividendCalendarDay[]>;
    listDividends: (
      accountId?: string,
      year?: number,
      statuses?: import('./portfolio/types').DividendRecordStatus[],
    ) => Promise<import('./portfolio/types').PortfolioDividendRecord[]>;
    addLedgerEntry: (input: import('./portfolio/types').CreatePortfolioLedgerInput) => Promise<import('./portfolio/types').PortfolioPositionView[]>;
    listLedgerEntries: (
      accountId?: string,
      symbol?: string,
    ) => Promise<import('./portfolio/types').PortfolioLedgerEntry[]>;
    updateLedgerEntry: (
      id: string,
      input: import('./portfolio/types').UpdatePortfolioLedgerInput,
    ) => Promise<import('./portfolio/types').PortfolioLedgerEntry>;
    deleteLedgerEntry: (id: string) => Promise<import('./portfolio/types').PortfolioPositionView[]>;
    deletePosition: (accountId: string | undefined, symbol: string) => Promise<import('./portfolio/types').PortfolioPositionView[]>;
    confirmDividend: (
      id: string,
      confirmed: boolean,
      cashAmount?: number,
      accountId?: string,
      year?: number,
    ) => Promise<import('./portfolio/types').PortfolioDividendRecord[]>;
    refreshDividends: (accountId?: string, symbol?: string) => Promise<import('./portfolio/types').PortfolioRefreshResult>;
    syncMarketQuotes: (accountId?: string) => Promise<import('./portfolio/types').PortfolioPositionView[]>;
  };
  license: {
    getStatus: () => Promise<import('./license/types').LicenseStatus>;
    activate: (code: string) => Promise<import('./license/types').LicenseActivateResult>;
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
    export: (options?: { includeLicense?: boolean }) => Promise<import('./backup/types').BackupExportResult | null>;
    import: () => Promise<import('./backup/types').BackupImportResult | null>;
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
    list: (status?: import('./playbook/types').PlaybookRuleStatus) => Promise<import('./playbook/types').PlaybookRule[]>;
    create: (input: import('./playbook/types').CreatePlaybookRuleInput) => Promise<import('./playbook/types').PlaybookRule>;
    update: (id: string, input: import('./playbook/types').UpdatePlaybookRuleInput) => Promise<import('./playbook/types').PlaybookRule>;
    archive: (id: string) => Promise<import('./playbook/types').PlaybookRule>;
    activationChecklist: (symbol?: string) => Promise<import('./playbook/types').PlaybookRule[]>;
  };
  sip: {
    listPlans: (statuses?: import('./sip/types').SipPlanStatus[]) => Promise<import('./sip/types').FundSipPlanView[]>;
    getPlan: (id: string) => Promise<import('./sip/types').FundSipPlanDetailView>;
    create: (input: import('./sip/types').CreateFundSipPlanInput) => Promise<import('./sip/types').FundSipPlanView>;
    update: (id: string, input: import('./sip/types').UpdateFundSipPlanInput) => Promise<import('./sip/types').FundSipPlanView>;
    setStatus: (id: string, status: import('./sip/types').SipPlanStatus) => Promise<import('./sip/types').FundSipPlanView>;
    previewSchedule: (input: import('./sip/types').CreateFundSipPlanInput) => Promise<import('./sip/types').FundSipOccurrencePreview[]>;
    listOccurrences: (planId?: string, from?: string, to?: string) => Promise<import('./sip/types').FundSipOccurrence[]>;
    listOccurrenceViews: (planId?: string, from?: string, to?: string) => Promise<import('./sip/types').FundSipOccurrenceView[]>;
    confirmOccurrence: (input: import('./sip/types').ConfirmFundSipOccurrenceInput) => Promise<import('./sip/types').ConfirmFundSipOccurrenceResult>;
    skipOccurrence: (id: string, reason: string) => Promise<import('./sip/types').FundSipOccurrence>;
    getSummary: () => Promise<import('./sip/types').SipSummaryView>;
    scanDue: () => Promise<import('./sip/types').SipScanResult>;
    getOccurrenceCalendar: (month: string) => Promise<import('./sip/types').SipOccurrenceCalendarDay[]>;
    getPositionMeta: (accountId?: string) => Promise<import('./sip/types').SipPositionMeta[]>;
    getReviewTemplate: (planId: string) => Promise<import('./sip/types').SipReviewTemplate>;
    getPlanPositionLink: (planId: string) => Promise<import('./sip/types').SipPlanPositionLink>;
    listPlansBySymbol: (accountId: string, symbol: string) => Promise<import('./sip/types').FundSipPlanView[]>;
    parseImportCsv: (sourcePath: string) => Promise<import('./sip/import-types').SipCsvParseResult>;
    previewImport: (input: import('./sip/import-types').SipImportInput) => Promise<import('./sip/import-types').SipImportPreviewResult>;
    commitImport: (input: import('./sip/import-types').SipImportInput) => Promise<import('./sip/import-types').SipImportCommitResult>;
    selectImportScreenshot: () => Promise<{ sourcePath: string; fileName: string } | null>;
    recognizeImportScreenshot: (sourcePath: string) => Promise<import('./sip/import-types').SipAiRecognizeResult>;
    previewAiImport: (input: import('./sip/import-types').SipAiImportInput) => Promise<import('./sip/import-types').SipImportPreviewResult>;
    commitAiImport: (input: import('./sip/import-types').SipAiImportInput) => Promise<import('./sip/import-types').SipImportCommitResult>;
  };
}
