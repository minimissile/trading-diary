import type { WatchlistPoolId } from '../watchlist/types';
import type { LicenseFeature, LicenseTier } from './types';

/** 免费版允许创建的最大计划数。 */
export const FREE_MAX_PLANS = 3;

/** 免费版允许创建的最大提醒数。 */
export const FREE_MAX_ALERTS = 5;

/** 新用户试用 Pro 的天数。 */
export const TRIAL_DAYS = 14;

/** 免费版可访问的自选池。 */
export const FREE_WATCHLIST_POOLS: WatchlistPoolId[] = ['dividend'];

/** Pro / 试用 / 终身共用的完整能力集。 */
export const PRO_FEATURES: LicenseFeature[] = [
  'ai_review',
  'portfolio_dividend_sync',
  'unlimited_plans',
  'unlimited_alerts',
  'watchlist_all_pools',
];

/**
 * 根据当前档位返回可用能力与数量限制。
 * @param tier 当前 License 档位
 */
export function resolveLicenseEntitlements(tier: LicenseTier): {
  features: LicenseFeature[];
  limits: { maxPlans: number | null; maxAlerts: number | null };
} {
  if (tier === 'pro' || tier === 'trial' || tier === 'lifetime') {
    return {
      features: [...PRO_FEATURES],
      limits: { maxPlans: null, maxAlerts: null },
    };
  }

  return {
    features: [],
    limits: { maxPlans: FREE_MAX_PLANS, maxAlerts: FREE_MAX_ALERTS },
  };
}
