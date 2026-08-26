import type { FeeProfileRates, TradeFeeInstrumentKind } from './types';

/** 场内 ETF/LOF 按独立佣金计费。 */
export function usesEtfCommissionTier(kind?: TradeFeeInstrumentKind): boolean {
  return kind === 'etf' || kind === 'lof';
}

/** 卖出是否收取印花税（ETF/LOF 场内免印花税）。 */
export function chargesStampDuty(side: 'buy' | 'sell', kind?: TradeFeeInstrumentKind): boolean {
  return side === 'sell' && !usesEtfCommissionTier(kind);
}

/** 解析实际佣金费率与最低佣金。 */
export function resolveCommissionRates(
  profile: FeeProfileRates,
  kind?: TradeFeeInstrumentKind,
): { ratePpm: number; minCents: number } {
  if (usesEtfCommissionTier(kind) && profile.etfCommissionRatePpm != null) {
    return {
      ratePpm: profile.etfCommissionRatePpm,
      minCents: profile.etfCommissionMinCents ?? profile.commissionMinCents,
    };
  }
  return {
    ratePpm: profile.commissionRatePpm,
    minCents: profile.commissionMinCents,
  };
}
