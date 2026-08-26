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
}

export interface TradeReview {
  id: string;
  planId: string | null;
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
}

export interface WorkspaceSnapshot {
  activePlanCount: number;
  triggeredAlertCount: number;
  pendingReviewCount: number;
  reviewedTradeCount: number;
  totalPnl: number;
  averageExecutionScore: number | null;
  activePlans: TradingPlan[];
  triggeredAlerts: TradeAlert[];
  pendingReviewPlans: TradingPlan[];
  recentReviews: TradeReview[];
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
  MarketNewsItem,
  MarketQuote,
  MarketSearchHit,
} from './market/types';

export type {
  DividendEvent,
  DividendListResult,
  InstrumentInfo,
  InstrumentKind,
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
    confirmDividend: (id: string, confirmed: boolean, cashAmount?: number) => Promise<import('./portfolio/types').PortfolioDividendRecord[]>;
    refreshDividends: (accountId?: string, symbol?: string) => Promise<import('./portfolio/types').PortfolioRefreshResult>;
    syncMarketQuotes: (accountId?: string) => Promise<import('./portfolio/types').PortfolioPositionView[]>;
  };
}
