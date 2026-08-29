import type { InstrumentKind } from '../market/types';

export type SipPlanStatus = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';
export type SipFrequency = 'weekly' | 'biweekly' | 'monthly';
export type SipOccurrenceStatus = 'scheduled' | 'due' | 'completed' | 'skipped' | 'missed';

/** 基金定投计划。 */
export interface FundSipPlan {
  id: string;
  accountId: string;
  symbol: string;
  name: string;
  kind: InstrumentKind;
  amount: number;
  frequency: SipFrequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  thesis: string;
  status: SipPlanStatus;
  createdAt: string;
  updatedAt: string;
}

/** 定投期次视图。 */
export interface FundSipOccurrence {
  id: string;
  planId: string;
  scheduledDate: string;
  status: SipOccurrenceStatus;
  amount: number | null;
  quantity: number | null;
  nav: number | null;
  fees: number | null;
  ledgerEntryId: string | null;
  skipReason: string;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 列表项：计划 + 统计摘要。 */
export interface FundSipPlanView extends FundSipPlan {
  completedCount: number;
  skippedCount: number;
  missedCount: number;
  dueCount: number;
  nextScheduledDate: string | null;
  currentStreak: number;
  disciplineRate: number | null;
}

/** 计划详情：含近期期次。 */
export interface FundSipPlanDetailView extends FundSipPlanView {
  occurrences: FundSipOccurrence[];
}

/** 今日工作台展示的待执行期次。 */
export interface FundSipOccurrenceView extends FundSipOccurrence {
  planName: string;
  symbol: string;
  kind: InstrumentKind;
  accountId: string;
  plannedAmount: number;
}

/** 创建定投计划输入。 */
export interface CreateFundSipPlanInput {
  accountId?: string;
  symbol: string;
  amount: number;
  frequency: SipFrequency;
  dayOfWeek?: number;
  dayOfMonth?: number;
  startDate: string;
  endDate?: string | null;
  thesis: string;
  activateNow?: boolean;
}

/** 更新定投计划输入。 */
export interface UpdateFundSipPlanInput {
  amount?: number;
  frequency?: SipFrequency;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  endDate?: string | null;
  thesis?: string;
}

/** 期次预览（创建前）。 */
export interface FundSipOccurrencePreview {
  scheduledDate: string;
}

/** 确认扣款输入。 */
export interface ConfirmFundSipOccurrenceInput {
  id: string;
  nav: number;
  quantity?: number;
  fees?: number;
  tradeAt?: string;
}

/** 定投汇总。 */
export interface SipSummaryView {
  activePlanCount: number;
  dueOccurrenceCount: number;
  completedThisMonth: number;
  disciplineRate: number | null;
  currentStreak: number;
  longestStreak: number;
  totalInvested: number;
}

/** 日历单日聚合。 */
export interface SipOccurrenceCalendarDay {
  date: string;
  items: Array<{
    occurrenceId: string;
    planId: string;
    planName: string;
    symbol: string;
    amount: number;
    status: SipOccurrenceStatus;
  }>;
}

/** 持仓页定投来源摘要。 */
export interface SipPositionMeta {
  symbol: string;
  activePlanNames: string[];
  confirmedBuyCount: number;
}

/** 到期扫描结果。 */
export interface SipScanResult {
  dueCount: number;
  newlyDue: number;
  newlyMissed: number;
  newlyDueOccurrences: FundSipOccurrenceView[];
}

/** 确认扣款结果。 */
export interface ConfirmFundSipOccurrenceResult {
  occurrence: FundSipOccurrence;
  ledgerEntryId: string;
}

/** 定投周期复盘模板。 */
export interface SipReviewTemplate {
  symbol: string;
  title: string;
  summary: string;
  lesson: string;
  entryPrice: number;
  quantity: number;
  fees: number;
}

/** 计划与持仓联动摘要。 */
export interface SipPlanPositionLink {
  planId: string;
  symbol: string;
  planName: string;
  accountId: string;
  hasPosition: boolean;
  positionQuantity: number | null;
  avgCost: number | null;
  unrealizedPnl: number | null;
}

export const SIP_GRACE_DAYS = 3;
export const SIP_ROLLING_HORIZON = 12;
