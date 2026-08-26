import type { FeeEstimateInput, FeeEstimateResult, FeeProfileRates } from '../../shared/accounts/types';
import { chargesStampDuty, resolveCommissionRates } from '../../shared/accounts/fee-rates';

const MONEY_SCALE = 100;
const RATE_SCALE = 1_000_000;

function roundMoney(value: number): number {
  return Math.round(value * MONEY_SCALE) / MONEY_SCALE;
}

function applyRate(amount: number, ratePpm: number): number {
  return roundMoney((amount * ratePpm) / RATE_SCALE);
}

function applyMinRate(amount: number, ratePpm: number, minCents: number): number {
  const raw = applyRate(amount, ratePpm);
  const min = minCents / MONEY_SCALE;
  return roundMoney(Math.max(raw, min));
}

/**
 * 按 A 股常见规则估算单笔交易费用。
 * @param input 方向、市场、价格数量、标的类型与费率配置
 */
export function estimateTradeFees(
  input: Pick<FeeEstimateInput, 'side' | 'market' | 'price' | 'quantity' | 'instrumentKind'>,
  profile: FeeProfileRates,
): FeeEstimateResult {
  const grossAmount = roundMoney(input.price * input.quantity);
  const { ratePpm, minCents } = resolveCommissionRates(profile, input.instrumentKind);
  const commission = applyMinRate(grossAmount, ratePpm, minCents);
  const stampDuty = chargesStampDuty(input.side, input.instrumentKind)
    ? applyRate(grossAmount, profile.stampDutyRatePpm)
    : 0;
  const transferFee = input.market === 'SH' ? applyRate(grossAmount, profile.transferFeeRatePpm) : 0;
  const otherFee = roundMoney(profile.otherFeeCents / MONEY_SCALE);
  const totalFees = roundMoney(commission + stampDuty + transferFee + otherFee);

  return {
    grossAmount,
    commission,
    stampDuty,
    transferFee,
    otherFee,
    totalFees,
  };
}
