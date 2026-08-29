import type { FeeEstimateInput, FeeEstimateResult, FeeProfileRates } from '../../shared/accounts/types';
import { NO_MIN_COMMISSION_SELL_REGULATORY_CENTS } from '../../shared/accounts/fee-presets';
import { chargesStampDuty, resolveCommissionWan, usesEtfCommissionTier } from '../../shared/accounts/fee-rates';

const MONEY_SCALE = 100;
const RATE_SCALE = 1_000_000;
/** 佣金「万 X」分母：费率 1.054 表示成交金额 × 1.054 / 10000。 */
const COMMISSION_WAN_DENOMINATOR = 10_000;

function roundMoney(value: number): number {
  return Math.round(value * MONEY_SCALE) / MONEY_SCALE;
}

function toCents(yuan: number): number {
  return Math.round(yuan * MONEY_SCALE);
}

function fromCents(cents: number): number {
  return cents / MONEY_SCALE;
}

function applyRateCents(amountCents: number, ratePpm: number): number {
  return Math.round((amountCents * ratePpm) / RATE_SCALE);
}

function sellRegulatorySurchargeCents(
  side: FeeEstimateInput['side'],
  minCents: number,
  instrumentKind: FeeEstimateInput['instrumentKind'],
): number {
  if (side !== 'sell' || minCents > 0 || usesEtfCommissionTier(instrumentKind)) {
    return 0;
  }
  return NO_MIN_COMMISSION_SELL_REGULATORY_CENTS;
}

/**
 * 按 A 股常见规则估算单笔交易费用。
 * 金额以「分」为单位中间计算，避免浮点累积误差。
 */
export function estimateTradeFees(
  input: Pick<FeeEstimateInput, 'side' | 'market' | 'price' | 'quantity' | 'instrumentKind'>,
  profile: FeeProfileRates,
): FeeEstimateResult {
  const grossAmount = roundMoney(input.price * input.quantity);
  const amountCents = toCents(grossAmount);
  const { commissionWan, minCents } = resolveCommissionWan(profile, input.instrumentKind, input.market);
  const commissionCents = Math.max(
    Math.round((amountCents * commissionWan) / COMMISSION_WAN_DENOMINATOR),
    minCents,
  );
  const regulatoryCents = sellRegulatorySurchargeCents(input.side, minCents, input.instrumentKind);
  const commission = fromCents(commissionCents);
  const stampDuty = chargesStampDuty(input.side, input.instrumentKind)
    ? fromCents(applyRateCents(amountCents, profile.stampDutyRatePpm))
    : 0;
  const transferFee =
    input.market === 'SH' ? fromCents(applyRateCents(amountCents, profile.transferFeeRatePpm)) : 0;
  const otherFee = roundMoney(profile.otherFeeCents / MONEY_SCALE + fromCents(regulatoryCents));
  const totalFees = roundMoney(commission + stampDuty + transferFee + otherFee);

  return {
    grossAmount,
    commission,
    stampDuty,
    transferFee,
    otherFee: roundMoney(otherFee),
    totalFees,
  };
}
