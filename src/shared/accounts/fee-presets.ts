import type { FeeProfileRates } from './types';

/** 印花税 0.05%（卖出收取）。 */
export const STAMP_DUTY_RATE_PPM = 500;

/** 过户费 0.001%（沪 A 收取）。 */
export const TRANSFER_FEE_RATE_PPM = 10;

/**
 * 无最低佣金账户卖出时的规费（经手/证管等，同花顺参考浮盈口径约 0.10 元）。
 * 有最低佣金时不叠加——规费已被最低佣金覆盖。
 */
export const NO_MIN_COMMISSION_SELL_REGULATORY_CENTS = 10;

/** 内置 A 股标准费率（万 2.5，最低 5 元）。 */
export const FEE_PROFILE_A_SHARE_STANDARD: FeeProfileRates & { id: string; name: string } = {
  id: 'fee-a-share-standard',
  name: 'A股标准（万2.5 / 最低5元）',
  commissionWan: 2.5,
  commissionMinCents: 500,
  etfCommissionWan: null,
  etfCommissionMinCents: null,
  etfShCommissionWan: null,
  etfShCommissionMinCents: null,
  etfSzCommissionWan: null,
  etfSzCommissionMinCents: null,
  hkCommissionWan: null,
  hkCommissionMinCents: null,
  usCommissionWan: null,
  usCommissionMinCents: null,
  usCommissionPerShare: null,
  stampDutyRatePpm: STAMP_DUTY_RATE_PPM,
  transferFeeRatePpm: TRANSFER_FEE_RATE_PPM,
  transferFeeMinCents: 0,
  otherFeeCents: 0,
};

/** 内置 A 股低佣费率（万 1.5）。 */
export const FEE_PROFILE_A_SHARE_LOW: FeeProfileRates & { id: string; name: string } = {
  id: 'fee-a-share-low',
  name: 'A股低佣（万1.5 / 最低5元）',
  commissionWan: 1.5,
  commissionMinCents: 500,
  etfCommissionWan: null,
  etfCommissionMinCents: null,
  etfShCommissionWan: null,
  etfShCommissionMinCents: null,
  etfSzCommissionWan: null,
  etfSzCommissionMinCents: null,
  hkCommissionWan: null,
  hkCommissionMinCents: null,
  usCommissionWan: null,
  usCommissionMinCents: null,
  usCommissionPerShare: null,
  stampDutyRatePpm: STAMP_DUTY_RATE_PPM,
  transferFeeRatePpm: TRANSFER_FEE_RATE_PPM,
  transferFeeMinCents: 0,
  otherFeeCents: 0,
};

/** 内置 A 股极低佣费率（万 1）。 */
export const FEE_PROFILE_A_SHARE_MIN: FeeProfileRates & { id: string; name: string } = {
  id: 'fee-a-share-min',
  name: 'A股极低佣（万1 / 最低5元）',
  commissionWan: 1,
  commissionMinCents: 500,
  etfCommissionWan: null,
  etfCommissionMinCents: null,
  etfShCommissionWan: null,
  etfShCommissionMinCents: null,
  etfSzCommissionWan: null,
  etfSzCommissionMinCents: null,
  hkCommissionWan: null,
  hkCommissionMinCents: null,
  usCommissionWan: null,
  usCommissionMinCents: null,
  usCommissionPerShare: null,
  stampDutyRatePpm: STAMP_DUTY_RATE_PPM,
  transferFeeRatePpm: TRANSFER_FEE_RATE_PPM,
  transferFeeMinCents: 0,
  otherFeeCents: 0,
};

/** 基金默认费率（场外申购，无印花税/过户费）。 */
export const FEE_PROFILE_FUND_DEFAULT: FeeProfileRates & { id: string; name: string } = {
  id: 'fee-fund-default',
  name: '基金默认（免五费）',
  commissionWan: 0,
  commissionMinCents: 0,
  etfCommissionWan: null,
  etfCommissionMinCents: null,
  etfShCommissionWan: null,
  etfShCommissionMinCents: null,
  etfSzCommissionWan: null,
  etfSzCommissionMinCents: null,
  hkCommissionWan: null,
  hkCommissionMinCents: null,
  usCommissionWan: null,
  usCommissionMinCents: null,
  usCommissionPerShare: null,
  stampDutyRatePpm: 0,
  transferFeeRatePpm: 0,
  transferFeeMinCents: 0,
  otherFeeCents: 0,
};

/** 全部内置费率模板。 */
export const BUILTIN_FEE_PRESETS = [
  FEE_PROFILE_A_SHARE_STANDARD,
  FEE_PROFILE_A_SHARE_LOW,
  FEE_PROFILE_A_SHARE_MIN,
  FEE_PROFILE_FUND_DEFAULT,
] as const;

/** 默认费率模板 id。 */
export const DEFAULT_FEE_PROFILE_ID = FEE_PROFILE_A_SHARE_STANDARD.id;
