import type {
  TradeAlertCondition,
  TradeAlertRole,
  TradeAlertStatus,
  TradeDirection,
  TradingPlanStatus,
} from '../../shared/api.types';

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

export function formatPrice(value: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 }).format(value);
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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
