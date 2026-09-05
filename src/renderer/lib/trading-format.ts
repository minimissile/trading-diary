import type { InstrumentKind } from '../../shared/market/types';
import type { FundSipPlan, SipFrequency, SipOccurrenceStatus, SipPlanStatus } from '../../shared/sip/types';
import type {
  TradeAlertCondition,
  TradeAlertRole,
  TradeAlertStatus,
  TradeDirection,
  TradingPlanStatus,
} from '../../shared/api.types';
import type { PlaybookCheckTiming, PlaybookRuleCategory } from '../../shared/playbook/types';
import {
  formatWithPreset,
  signedToneClass,
  quantityPresetForKind,
  pricePresetForKind,
  formatFloatingPnlCaption,
  formatDailyPnlCaption,
} from '../../shared/format/display-presets';
import { formatQuoteRefreshTime } from '../../shared/format/date-format';
import { formatDisplayCurrency, formatNumber } from '../../shared/format/number-format';

/**
 * 渲染层数值格式化统一出口。
 *
 * 页面与组件只应 import 本模块，不要直接使用 shared/format/*。
 *
 * @see docs/NUMBER_FORMAT.md
 */
export {
  formatNumber,
  formatDisplayCurrency,
  formatWithPreset,
  signedToneClass,
  quantityPresetForKind,
  pricePresetForKind,
  formatFloatingPnlCaption,
  formatDailyPnlCaption,
  formatQuoteRefreshTime,
};
export type { FormatNumberOptions, FormatCurrencyOptions } from '../../shared/format/number-format';
export type { DisplayPresetKind } from '../../shared/format/display-presets';
export { ValueDisplay, statisticCurrencyFormatter, statisticPnlFormatter } from '../components/trading/ValueDisplay';
export { AnimatedValueDisplay } from '../components/trading/AnimatedValueDisplay';

export const planStatusLabels: Readonly<Record<TradingPlanStatus, string>> = {
  draft: '草稿',
  watching: '等待入场',
  holding: '持仓中',
  completed: '已结束',
  cancelled: '已取消',
};

export const planStatusColors: Readonly<Record<TradingPlanStatus, string>> = {
  draft: 'default',
  watching: 'blue',
  holding: 'orange',
  completed: 'green',
  cancelled: 'default',
};

export const alertStatusLabels: Readonly<Record<TradeAlertStatus, string>> = {
  active: '监控中',
  triggered: '已触发',
  completed: '已处理',
  disabled: '已停用',
};

export const alertStatusColors: Readonly<Record<TradeAlertStatus, string>> = {
  active: 'blue',
  triggered: 'orange',
  completed: 'green',
  disabled: 'default',
};

export const alertRoleLabels: Readonly<Record<TradeAlertRole, string>> = {
  entry: '入场',
  stop: '风险',
  target: '目标',
  custom: '自定义',
};

export const directionLabels: Readonly<Record<TradeDirection, string>> = {
  long: '做多',
  short: '做空',
};

export const playbookCategoryLabels: Readonly<Record<PlaybookRuleCategory, string>> = {
  entry: '入场',
  position: '仓位',
  stop: '止损',
  exit: '退出',
  market: '市场环境',
  emotion: '情绪',
  process: '操作流程',
};

export const playbookCheckTimingLabels: Readonly<Record<PlaybookCheckTiming, string>> = {
  plan_activation: '计划激活前',
  always: '始终适用',
};

/** 价格展示（最多 4 位小数，去末尾零，不带千分位）。 */
export function formatPrice(value: number): string {
  return formatWithPreset(value, 'price');
}

/** 按标的类型格式化价格。 */
export function formatPriceForKind(value: number, kind?: InstrumentKind): string {
  return formatWithPreset(value, pricePresetForKind(kind));
}

/** 按标的类型格式化份额。 */
export function formatQuantityForKind(value: number | null | undefined, kind?: InstrumentKind): string {
  return formatWithPreset(value, quantityPresetForKind(kind));
}

/** 普通货币展示（¥，千分位，最多 2 位小数，去末尾零）。 */
export function formatCurrency(value: number | null | undefined): string {
  return formatWithPreset(value, 'currency');
}

/** 盈亏货币展示（+/-，¥，千分位，最多 2 位小数，去末尾零）。 */
export function formatSignedCurrency(value: number | null | undefined): string {
  return formatWithPreset(value, 'pnl');
}

/** 份额展示。 */
export function formatQuantity(value: number | null | undefined): string {
  return formatWithPreset(value, 'quantity');
}

/** 涨跌幅展示（+/-，%，最多 2 位小数）。 */
export function formatPercent(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return formatNumber(value, { maximumFractionDigits: digits, signed: true, trimTrailingZeros: true }) + '%';
}

/** @deprecated 使用 signedToneClass 或 ValueDisplay */
export function changeClass(value: number | null | undefined): string {
  return signedToneClass(value);
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

/** 成交日期展示（年月日）。 */
export function formatTradeDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(value));
}

export function formatAlertCondition(condition: TradeAlertCondition, price: number): string {
  return `${condition === 'at_or_above' ? '达到或高于' : '达到或低于'} ${formatPrice(price)}`;
}

export function calculateExpectedR(entryPrice: number, stopPrice: number, targetPrice: number | null): number | null {
  if (targetPrice === null) return null;
  const risk = Math.abs(entryPrice - stopPrice);
  if (risk === 0) return null;
  return Math.abs(targetPrice - entryPrice) / risk;
}

export const sipPlanStatusLabels: Readonly<Record<SipPlanStatus, string>> = {
  draft: '草稿',
  active: '执行中',
  paused: '已暂停',
  completed: '已完成',
  cancelled: '已取消',
};

export const sipPlanStatusColors: Readonly<Record<SipPlanStatus, string>> = {
  draft: 'default',
  active: 'green',
  paused: 'orange',
  completed: 'blue',
  cancelled: 'default',
};

export const sipOccurrenceStatusLabels: Readonly<Record<SipOccurrenceStatus, string>> = {
  scheduled: '待执行',
  due: '已到期',
  completed: '已确认',
  skipped: '已跳过',
  missed: '已逾期',
};

export const sipFrequencyLabels: Readonly<Record<SipFrequency, string>> = {
  daily: '每个交易日',
  weekly: '每周',
  biweekly: '每两周',
  monthly: '每月',
};

export const weekdayLabels: Readonly<Record<number, string>> = {
  1: '周一',
  2: '周二',
  3: '周三',
  4: '周四',
  5: '周五',
  6: '周六',
  7: '周日',
};

export function formatSipSchedule(plan: Pick<FundSipPlan, 'frequency' | 'dayOfWeek' | 'dayOfMonth'>): string {
  if (plan.frequency === 'daily') {
    return '每个交易日';
  }
  if (plan.frequency === 'monthly') {
    return `每月 ${plan.dayOfMonth ?? '—'} 日`;
  }
  const weekday = plan.dayOfWeek ? weekdayLabels[plan.dayOfWeek] : '—';
  return plan.frequency === 'biweekly' ? `每两周 · ${weekday}` : `每周 · ${weekday}`;
}
