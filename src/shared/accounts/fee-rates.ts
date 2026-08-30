import type { FeeProfileRates, TradeFeeInstrumentKind, FeeMarket } from './types';
import { roundCommissionWan } from './fee-utils';

/** 场内 ETF/LOF 按独立佣金计费。 */
export function usesEtfCommissionTier(kind?: TradeFeeInstrumentKind): boolean {
  return kind === 'etf' || kind === 'lof';
}

/** 卖出是否收取印花税（ETF/LOF 场内免印花税）。 */
export function chargesStampDuty(side: 'buy' | 'sell', kind?: TradeFeeInstrumentKind): boolean {
  return side === 'sell' && !usesEtfCommissionTier(kind);
}

export interface ResolvedCommissionRates {
  commissionWan: number;
  minCents: number;
  /** 美股每股佣金；> 0 时按股数计费。 */
  perShare: number | null;
}

function resolveEtfFallbackRates(profile: FeeProfileRates): { commissionWan: number; minCents: number } {
  if (profile.etfCommissionWan != null) {
    return {
      commissionWan: profile.etfCommissionWan,
      minCents: profile.etfCommissionMinCents ?? profile.commissionMinCents,
    };
  }
  return {
    commissionWan: profile.commissionWan,
    minCents: profile.commissionMinCents,
  };
}

function resolveMarketEtfRates(
  profile: FeeProfileRates,
  market: 'SH' | 'SZ' | null,
): { commissionWan: number; minCents: number } | null {
  if (market === 'SH' && profile.etfShCommissionWan != null) {
    return {
      commissionWan: profile.etfShCommissionWan,
      minCents: profile.etfShCommissionMinCents ?? profile.commissionMinCents,
    };
  }
  if (market === 'SZ' && profile.etfSzCommissionWan != null) {
    return {
      commissionWan: profile.etfSzCommissionWan,
      minCents: profile.etfSzCommissionMinCents ?? profile.commissionMinCents,
    };
  }
  return null;
}

/** 解析实际佣金（万 X）、最低佣金与美股每股佣金。 */
export function resolveCommissionRates(
  profile: FeeProfileRates,
  kind?: TradeFeeInstrumentKind,
  market?: FeeMarket,
): ResolvedCommissionRates {
  if (market === 'HK') {
    const wan = profile.hkCommissionWan ?? profile.commissionWan;
    const minCents = profile.hkCommissionMinCents ?? profile.commissionMinCents;
    return {
      commissionWan: roundCommissionWan(wan),
      minCents,
      perShare: null,
    };
  }
  if (market === 'US') {
    const wan = profile.usCommissionWan ?? profile.commissionWan;
    const minCents = profile.usCommissionMinCents ?? profile.commissionMinCents;
    const perShare =
      profile.usCommissionPerShare != null && profile.usCommissionPerShare > 0
        ? profile.usCommissionPerShare
        : null;
    return {
      commissionWan: roundCommissionWan(wan),
      minCents,
      perShare,
    };
  }
  if (usesEtfCommissionTier(kind)) {
    const marketRates = resolveMarketEtfRates(profile, market ?? null);
    if (marketRates) {
      return { ...marketRates, perShare: null };
    }
    const fallback = resolveEtfFallbackRates(profile);
    return { ...fallback, perShare: null };
  }
  return {
    commissionWan: roundCommissionWan(profile.commissionWan),
    minCents: profile.commissionMinCents,
    perShare: null,
  };
}

/** @deprecated 使用 resolveCommissionRates。 */
export function resolveCommissionWan(
  profile: FeeProfileRates,
  kind?: TradeFeeInstrumentKind,
  market?: FeeMarket,
): { commissionWan: number; minCents: number } {
  const rates = resolveCommissionRates(profile, kind, market);
  return { commissionWan: rates.commissionWan, minCents: rates.minCents };
}
