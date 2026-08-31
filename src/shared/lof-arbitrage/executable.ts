import type { LofArbitrageRule, LofArbitrageSnapshot } from './types';

/** 是否存在扣费后仍为正、且 blockers 为空的可执行套利路径。 */
export function isExecutableArbitrage(snapshot: LofArbitrageSnapshot): boolean {
  return snapshot.recommendedPath?.feasible === true;
}

/** 快照是否满足提醒规则（仅可执行套利）。 */
export function snapshotMatchesExecutableRule(snapshot: LofArbitrageSnapshot, rule: LofArbitrageRule): boolean {
  if (!isExecutableArbitrage(snapshot)) return false;
  if (rule.symbol && rule.symbol !== snapshot.symbol) return false;
  if (snapshot.premiumRate === null) return false;

  if (rule.minAmount != null && (snapshot.amount ?? 0) < rule.minAmount) return false;
  if (rule.requireSubscriptionOpen && snapshot.subscriptionStatus === 'paused' && snapshot.premiumRate > 0) {
    return false;
  }
  if (rule.minNetSpread != null && (snapshot.netSpread ?? -Infinity) < rule.minNetSpread) return false;

  const path = snapshot.recommendedPath!;

  const premiumHit =
    (rule.direction === 'premium' || rule.direction === 'both') &&
    snapshot.premiumRate >= rule.thresholdRate &&
    path.kind.startsWith('premium');

  const discountHit =
    (rule.direction === 'discount' || rule.direction === 'both') &&
    snapshot.premiumRate <= -rule.thresholdRate &&
    path.kind === 'discount_exchange_redeem';

  return premiumHit || discountHit;
}
