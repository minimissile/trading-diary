import type { LofReferenceNavSource } from '../../shared/lof-arbitrage/types';

/** 蚂蚁等平台常见 LOF 场外申购费率。 */
export const DEFAULT_LOF_SUBSCRIPTION_FEE_RATE = 0.0012;

/** 简化场内卖出佣金（万 1）。 */
export const DEFAULT_LOF_SELL_COMMISSION_RATE = 0.0001;

/** 简化场内买入佣金（万 1）。 */
export const DEFAULT_LOF_BUY_COMMISSION_RATE = 0.0001;

/** 简化赎回费率（持有不足 7 日，保守取 1.5%）。 */
export const DEFAULT_LOF_REDEMPTION_FEE_RATE = 0.015;

/** 默认溢价提醒阈值（2%）。 */
export const DEFAULT_LOF_MIN_PREMIUM_RATE = 0.02;

/** 默认折价提醒阈值（1%）。 */
export const DEFAULT_LOF_MIN_DISCOUNT_RATE = 0.01;

export interface ReferenceNavInput {
  publishedNav: number | null;
  estimatedNav: number | null;
  tradingSessionActive: boolean;
}

export interface ReferenceNavResult {
  referenceNav: number | null;
  referenceNavSource: LofReferenceNavSource | null;
}

/**
 * 选取 LOF 套利计算用的参考净值。
 * 交易时段优先盘中估值，否则用已公布净值。
 */
export function resolveReferenceNav(input: ReferenceNavInput): ReferenceNavResult {
  if (input.tradingSessionActive && input.estimatedNav !== null && input.estimatedNav > 0) {
    return { referenceNav: input.estimatedNav, referenceNavSource: 'estimated' };
  }
  if (input.publishedNav !== null && input.publishedNav > 0) {
    return { referenceNav: input.publishedNav, referenceNavSource: 'published' };
  }
  if (input.estimatedNav !== null && input.estimatedNav > 0) {
    return { referenceNav: input.estimatedNav, referenceNavSource: 'estimated' };
  }
  return { referenceNav: null, referenceNavSource: null };
}

/**
 * 计算溢价率（小数）。
 * @returns 0.0474 表示 +4.74%；负值表示折价
 */
export function computePremiumRate(marketPrice: number | null, referenceNav: number | null): number | null {
  if (marketPrice === null || referenceNav === null || referenceNav <= 0) return null;
  return (marketPrice - referenceNav) / referenceNav;
}

/** 溢价路径扣费后的净空间（小数）。 */
export function computePremiumNetSpread(
  premiumRate: number,
  subscriptionFeeRate = DEFAULT_LOF_SUBSCRIPTION_FEE_RATE,
  sellCommissionRate = DEFAULT_LOF_SELL_COMMISSION_RATE,
): number {
  return premiumRate - subscriptionFeeRate - sellCommissionRate;
}

/** 折价路径扣费后的净空间（小数，正值表示有空间）。 */
export function computeDiscountNetSpread(
  premiumRate: number,
  redemptionFeeRate = DEFAULT_LOF_REDEMPTION_FEE_RATE,
  buyCommissionRate = DEFAULT_LOF_BUY_COMMISSION_RATE,
): number {
  return Math.abs(premiumRate) - redemptionFeeRate - buyCommissionRate;
}
