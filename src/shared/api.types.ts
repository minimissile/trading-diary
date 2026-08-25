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
  };
  updater: {
    getState: () => Promise<UpdateState>;
    check: () => Promise<UpdateState>;
    download: () => Promise<UpdateState>;
    install: () => Promise<void>;
    openReleasePage: () => Promise<void>;
    onStateChanged: (listener: (state: UpdateState) => void) => () => void;
  };
}
