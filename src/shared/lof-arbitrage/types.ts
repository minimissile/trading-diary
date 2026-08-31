/** 基金申赎状态（由东方财富 F10 文案映射）。 */
export type FundTradingGateStatus = 'open' | 'paused' | 'limited' | 'unknown';

/** 参考净值来源。 */
export type LofReferenceNavSource = 'estimated' | 'published';

/** 套利路径类型。 */
export type LofArbitragePathKind =
  | 'premium_exchange_subscribe'
  | 'premium_otc_subscribe'
  | 'discount_exchange_redeem';

/** 监控规则方向。 */
export type LofArbitrageDirection = 'premium' | 'discount' | 'both';

/** 监控规则状态。 */
export type LofArbitrageRuleStatus = 'active' | 'paused' | 'triggered';

export interface LofTimelineMilestone {
  /** 相对 T 日偏移，如 0、1、2、4。 */
  dayOffset: number;
  label: string;
  action: string;
}

/** 单条套利路径及可行性。 */
export interface LofArbitragePath {
  kind: LofArbitragePathKind;
  label: string;
  milestones: LofTimelineMilestone[];
  /** 扣简化费用后的净空间（小数，0.02 = 2%）。 */
  estimatedNetSpread: number | null;
  blockers: string[];
  feasible: boolean;
}

/** LOF 套利快照（一次数据聚合结果）。 */
export interface LofArbitrageSnapshot {
  symbol: string;
  name: string;
  market: 'SH' | 'SZ';
  marketPrice: number | null;
  publishedNav: number | null;
  navDate: string | null;
  estimatedNav: number | null;
  estimatedNavChangePercent: number | null;
  referenceNav: number | null;
  referenceNavSource: LofReferenceNavSource | null;
  /** 溢价率小数：0.0474 表示 +4.74%。 */
  premiumRate: number | null;
  amount: number | null;
  volume: number | null;
  subscriptionStatus: FundTradingGateStatus;
  subscriptionStatusLabel: string | null;
  redemptionStatus: FundTradingGateStatus;
  redemptionStatusLabel: string | null;
  feasiblePaths: LofArbitragePath[];
  recommendedPath: LofArbitragePath | null;
  /** 扣费后净空间（小数）。 */
  netSpread: number | null;
  fetchedAt: string;
}

/** 用户监控的 LOF 标的。 */
export interface LofWatchItem {
  id: string;
  symbol: string;
  notes: string | null;
  createdAt: string;
}

/** 折溢价提醒规则。 */
export interface LofArbitrageRule {
  id: string;
  symbol: string | null;
  direction: LofArbitrageDirection;
  /** 触发阈值（小数，0.02 = 2%）。 */
  thresholdRate: number;
  minAmount: number | null;
  requireSubscriptionOpen: boolean;
  minNetSpread: number | null;
  status: LofArbitrageRuleStatus;
  lastTriggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLofArbitrageRuleInput {
  symbol?: string | null;
  direction: LofArbitrageDirection;
  thresholdRate: number;
  minAmount?: number | null;
  requireSubscriptionOpen?: boolean;
  minNetSpread?: number | null;
}

export interface LofArbitrageMonitorResult {
  watchItems: LofWatchItem[];
  snapshots: LofArbitrageSnapshot[];
  rules: LofArbitrageRule[];
  fetchedAt: string;
}

export interface LofArbitrageScanResult {
  snapshots: LofArbitrageSnapshot[];
  fetchedAt: string;
}

/** 套利提醒触发事件。 */
export interface LofArbitrageAlertEvent {
  id: string;
  ruleId: string;
  symbol: string;
  title: string;
  premiumRate: number;
  netSpread: number | null;
  recommendedPathLabel: string | null;
  triggeredAt: string;
  userAction: 'acknowledged' | 'dismissed' | null;
}

export interface LofArbitragePollResult {
  evaluatedSymbolCount: number;
  newlyTriggered: LofArbitrageAlertEvent[];
}
