import type {
  FundTradingGateStatus,
  LofArbitragePath,
  LofArbitragePathKind,
} from '../../shared/lof-arbitrage/types';
import {
  computeDiscountNetSpread,
  computePremiumNetSpread,
  DEFAULT_LOF_MIN_DISCOUNT_RATE,
  DEFAULT_LOF_MIN_PREMIUM_RATE,
} from './spread-calculator';
import {
  buildDiscountTimeline,
  buildPremiumExchangeTimeline,
  buildPremiumOtcTimeline,
  pathLabel,
} from './timeline-calculator';

export interface FeasibilityInput {
  market: 'SH' | 'SZ';
  premiumRate: number | null;
  amount: number | null;
  subscriptionStatus: FundTradingGateStatus;
  redemptionStatus: FundTradingGateStatus;
  minAmount?: number;
  minPremiumRate?: number;
  minDiscountRate?: number;
}

function buildPath(
  kind: LofArbitragePathKind,
  milestones: LofArbitragePath['milestones'],
  estimatedNetSpread: number | null,
  blockers: string[],
): LofArbitragePath {
  return {
    kind,
    label: pathLabel(kind),
    milestones,
    estimatedNetSpread,
    blockers,
    feasible: blockers.length === 0 && estimatedNetSpread !== null && estimatedNetSpread > 0,
  };
}

/**
 * 评估 LOF 当前可执行的套利路径。
 */
export function evaluateArbitragePaths(input: FeasibilityInput): LofArbitragePath[] {
  const minPremium = input.minPremiumRate ?? DEFAULT_LOF_MIN_PREMIUM_RATE;
  const minDiscount = input.minDiscountRate ?? DEFAULT_LOF_MIN_DISCOUNT_RATE;
  const minAmount = input.minAmount ?? 0;
  const paths: LofArbitragePath[] = [];

  if (input.premiumRate === null) {
    return paths;
  }

  const premiumBlockers: string[] = [];
  if (input.premiumRate < minPremium) {
    premiumBlockers.push(`溢价率 ${(input.premiumRate * 100).toFixed(2)}% 低于阈值`);
  }
  if (input.amount !== null && input.amount < minAmount) {
    premiumBlockers.push('成交额不足，流动性偏弱');
  }
  if (input.subscriptionStatus === 'paused') {
    premiumBlockers.push('暂停申购，溢价套利不可执行');
  } else if (input.subscriptionStatus === 'limited') {
    premiumBlockers.push('申购受限，需确认限购额度');
  }

  const premiumNet = computePremiumNetSpread(input.premiumRate);
  if (premiumNet <= 0 && input.premiumRate >= minPremium) {
    premiumBlockers.push('扣费后净空间不足');
  }

  paths.push(
    buildPath(
      'premium_exchange_subscribe',
      buildPremiumExchangeTimeline(),
      input.premiumRate >= minPremium ? premiumNet : null,
      [...premiumBlockers],
    ),
  );

  const otcBlockers = [...premiumBlockers];
  paths.push(
    buildPath(
      'premium_otc_subscribe',
      buildPremiumOtcTimeline(),
      input.premiumRate >= minPremium ? premiumNet : null,
      otcBlockers,
    ),
  );

  const discountBlockers: string[] = [];
  if (input.premiumRate > -minDiscount) {
    discountBlockers.push(`折价率 ${(Math.abs(input.premiumRate) * 100).toFixed(2)}% 低于阈值`);
  }
  if (input.redemptionStatus === 'paused') {
    discountBlockers.push('暂停赎回');
  }

  const discountNet = computeDiscountNetSpread(input.premiumRate);
  if (discountNet <= 0 && input.premiumRate <= -minDiscount) {
    discountBlockers.push('扣费后净空间不足（赎回费较高）');
  }

  paths.push(
    buildPath(
      'discount_exchange_redeem',
      buildDiscountTimeline(input.market),
      input.premiumRate <= -minDiscount ? discountNet : null,
      discountBlockers,
    ),
  );

  return paths;
}

/** 从可行路径中选取推荐路径。 */
export function pickRecommendedPath(paths: LofArbitragePath[]): LofArbitragePath | null {
  const feasible = paths.filter((path) => path.feasible);
  if (feasible.length === 0) return null;

  const premiumPaths = feasible.filter((path) => path.kind.startsWith('premium'));
  if (premiumPaths.length > 0) {
    return premiumPaths.sort(
      (left, right) => (right.estimatedNetSpread ?? 0) - (left.estimatedNetSpread ?? 0),
    )[0] ?? null;
  }

  return feasible.sort(
    (left, right) => (right.estimatedNetSpread ?? 0) - (left.estimatedNetSpread ?? 0),
  )[0] ?? null;
}
