import type {
  AssetStats,
  CreateTradeAlertInput,
  CreateTradeReviewInput,
  CreateTradingPlanInput,
  HealthResult,
  ImportedAsset,
  QuoteEvaluationResult,
  TradeAlert,
  TradeAlertStatus,
  TradeReview,
  TradingPlan,
  TradingPlanStatus,
  WorkspaceSnapshot,
} from './api.types';

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
}

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
  { type: 'service:init'; dataDir: string } | { type: 'service:request'; request: ServiceRequest } | { type: 'service:shutdown' };

export type ServiceToMainMessage =
  | { type: 'service:ready' }
  | { type: 'service:response'; response: ServiceResponse }
  | { type: 'service:fatal'; message: string };
