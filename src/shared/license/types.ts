/** License 档位：免费、试用、Pro、终身。 */
export type LicenseTier = 'free' | 'trial' | 'pro' | 'lifetime';

/** License 激活来源。 */
export type LicenseSource = 'none' | 'trial' | 'license';

/** 可单独开关的 Pro 能力标识。 */
export type LicenseFeature =
  | 'ai_review'
  | 'portfolio_dividend_sync'
  | 'unlimited_plans'
  | 'unlimited_alerts'
  | 'watchlist_all_pools';

/** 写入激活码 payload 的结构（签名前）。 */
export interface LicensePayload {
  v: 1;
  tier: 'pro' | 'lifetime';
  exp: string;
  lid: string;
}

/** 渲染进程可见的 License 状态快照。 */
export interface LicenseStatus {
  tier: LicenseTier;
  source: LicenseSource;
  exp: string | null;
  trialDaysRemaining: number | null;
  features: LicenseFeature[];
  limits: {
    maxPlans: number | null;
    maxAlerts: number | null;
  };
  licenseId: string | null;
  activatedAt: string | null;
}

/** 激活成功后的结果。 */
export interface LicenseActivateResult {
  status: LicenseStatus;
  message: string;
}
