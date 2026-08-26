import type { AccountKind, FeeProfile } from './types';

/** 万X 佣金 → ppm（百万分比）。万 0.8 → 80 ppm。 */
export function commissionWanToPpm(wan: number): number {
  return Math.round(wan * 100);
}

/** ppm → 万X。 */
export function commissionPpmToWan(ppm: number): number {
  return ppm / 100;
}

/** 格式化佣金为「万 X」文案。 */
export function formatCommissionWan(ppm: number): string {
  const wan = commissionPpmToWan(ppm);
  if (wan >= 1) return `万${Number(wan.toFixed(4).replace(/\.?0+$/, ''))}`;
  return `万${wan.toFixed(2).replace(/\.?0+$/, '')}`;
}

/** 账户卡片上展示费率摘要。 */
export function formatFeeProfileSummary(profile: FeeProfile, accountKind: AccountKind): string {
  if (accountKind === 'fund') {
    if (profile.commissionRatePpm === 0) return '免申购费';
    return `申购 ${formatCommissionWan(profile.commissionRatePpm)}`;
  }
  const stockWan = formatCommissionWan(profile.commissionRatePpm);
  const stockMin =
    profile.commissionMinCents === 0 ? '无最低' : `最低 ${profile.commissionMinCents / 100} 元`;
  const stockPart = `股票 ${stockWan} · ${stockMin}`;
  const etfRatePpm = profile.etfCommissionRatePpm ?? profile.commissionRatePpm;
  const etfMinCents = profile.etfCommissionMinCents ?? profile.commissionMinCents;
  const etfWan = formatCommissionWan(etfRatePpm);
  const etfMin = etfMinCents === 0 ? '无最低' : `最低 ${etfMinCents / 100} 元`;
  return `${stockPart}；ETF ${etfWan} · ${etfMin}`;
}

/** 股票账户默认佣金（万 2.5）。 */
export const DEFAULT_SECURITIES_COMMISSION_WAN = 2.5;

/** 股票账户默认最低佣金（元）。 */
export const DEFAULT_SECURITIES_COMMISSION_MIN_YUAN = 5;
