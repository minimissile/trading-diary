import type { FeeProfileRates, TradeFeeInstrumentKind } from './types';
import { roundCommissionWan } from './fee-utils';

/** 场内 ETF/LOF 按独立佣金计费。 */
export function usesEtfCommissionTier(kind?: TradeFeeInstrumentKind): boolean {
  return kind === 'etf' || kind === 'lof';
}

/** 卖出是否收取印花税（ETF/LOF 场内免印花税）。 */
export function chargesStampDuty(side: 'buy' | 'sell', kind?: TradeFeeInstrumentKind): boolean {
  return side === 'sell' && !usesEtfCommissionTier(kind);
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

/** 解析实际佣金（万 X）与最低佣金。 */
export function resolveCommissionWan(
  profile: FeeProfileRates,
  kind?: TradeFeeInstrumentKind,
  market?: 'SH' | 'SZ' | null,
): { commissionWan: number; minCents: number } {
  if (usesEtfCommissionTier(kind)) {
    const marketRates = resolveMarketEtfRates(profile, market ?? null);
    if (marketRates) return marketRates;
    return resolveEtfFallbackRates(profile);
  }
  return {
    commissionWan: roundCommissionWan(profile.commissionWan),
    minCents: profile.commissionMinCents,
  };
}
