import type { AccountKind, FeeProfile } from './types';

/** 佣金「万 X」保留 4 位小数（与数据库 commission_wan 一致）。 */
export function roundCommissionWan(wan: number): number {
  return Math.round(wan * 10_000) / 10_000;
}

/** 格式化佣金为「万 X」文案。 */
export function formatCommissionWan(wan: number): string {
  const normalized = roundCommissionWan(wan);
  if (normalized >= 1) return `万${Number(normalized.toFixed(4).replace(/\.?0+$/, ''))}`;
  return `万${normalized.toFixed(4).replace(/\.?0+$/, '')}`;
}

/** 读取费率模板中指定市场的 ETF/LOF 表单值。 */
export function resolveEtfMarketFormRates(
  profile: FeeProfile,
  market: 'SH' | 'SZ',
): { wan: number; minYuan: number; noMin: boolean } {
  const fallbackWan = profile.etfCommissionWan ?? profile.commissionWan;
  const fallbackMinCents = profile.etfCommissionMinCents ?? profile.commissionMinCents;
  const wan =
    market === 'SH'
      ? (profile.etfShCommissionWan ?? fallbackWan)
      : (profile.etfSzCommissionWan ?? fallbackWan);
  const minCents =
    market === 'SH'
      ? (profile.etfShCommissionMinCents ?? fallbackMinCents)
      : (profile.etfSzCommissionMinCents ?? fallbackMinCents);

  return {
    wan: roundCommissionWan(wan),
    minYuan: minCents / 100,
    noMin: minCents === 0,
  };
}

/** 账户卡片上展示费率摘要。 */
export function formatFeeProfileSummary(profile: FeeProfile, accountKind: AccountKind): string {
  if (accountKind === 'fund') {
    if (profile.commissionWan === 0) return '免申购费';
    return `申购 ${formatCommissionWan(profile.commissionWan)}`;
  }
  const stockWan = formatCommissionWan(profile.commissionWan);
  const stockMin =
    profile.commissionMinCents === 0 ? '无最低' : `最低 ${profile.commissionMinCents / 100} 元`;
  const stockPart = `股票 ${stockWan} · ${stockMin}`;
  const sh = resolveEtfMarketFormRates(profile, 'SH');
  const sz = resolveEtfMarketFormRates(profile, 'SZ');
  const shPart = `沪 ETF ${formatCommissionWan(sh.wan)} · ${sh.noMin ? '无最低' : `最低 ${sh.minYuan} 元`}`;
  const szPart = `深 ETF ${formatCommissionWan(sz.wan)} · ${sz.noMin ? '无最低' : `最低 ${sz.minYuan} 元`}`;
  if (sh.wan === sz.wan && sh.noMin === sz.noMin && sh.minYuan === sz.minYuan) {
    return `${stockPart}；ETF ${formatCommissionWan(sh.wan)} · ${sh.noMin ? '无最低' : `最低 ${sh.minYuan} 元`}`;
  }
  return `${stockPart}；${shPart}；${szPart}`;
}

/** 股票账户默认佣金（万 2.5）。 */
export const DEFAULT_SECURITIES_COMMISSION_WAN = 2.5;

/** 股票账户默认最低佣金（元）。 */
export const DEFAULT_SECURITIES_COMMISSION_MIN_YUAN = 5;
