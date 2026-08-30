import type { InstrumentKind } from './types';

/** 基金运作方式（由东方财富 FUNDTYPE / 申赎状态推断）。 */
export type FundOperationMode = 'open' | 'closed_end' | 'closed_period' | 'unknown';

/** 东方财富 FundMNNBasicInformation 返回的原始字段（尽可能保留）。 */
export type EastMoneyFundBasicInfo = Record<string, unknown> & {
  FCODE?: string;
  SHORTNAME?: string;
  FTYPE?: string;
  FEATURE?: string;
  BFUNDTYPE?: string;
  FUNDTYPE?: string;
  SGZT?: string;
  SHZT?: string;
  ESTABDATE?: string;
  JJGS?: string;
  RISKLEVEL?: string;
  ISLIST?: string;
  ISLISTTRADE?: string;
  MINSG?: string;
  RATE?: string;
  SOURCERATE?: string;
  BENCH?: string;
  INDEXNAME?: string;
  YZBA?: string;
  FBYZQ?: string;
};

export interface FundProfileRecord {
  symbol: string;
  kind: InstrumentKind;
  profile: EastMoneyFundBasicInfo;
  fetchedAt: string;
}

/** 持仓页展示的基金档案摘要。 */
export interface FundProfileSummary {
  category: string | null;
  operationMode: FundOperationMode;
  operationModeLabel: string | null;
  purchaseStatus: string | null;
  redemptionStatus: string | null;
  fundCompany: string | null;
  establishDate: string | null;
  isListed: boolean;
  riskLevel: string | null;
}

const OPERATION_MODE_LABELS: Record<FundOperationMode, string | null> = {
  open: null,
  closed_end: '封闭式',
  closed_period: '封闭期',
  unknown: null,
};

export function shouldCacheFundProfile(kind: InstrumentKind): boolean {
  return kind === 'otc_fund' || kind === 'lof' || kind === 'etf';
}

function includesClosedPeriod(text: string | undefined): boolean {
  return Boolean(text && /封闭/u.test(text));
}

export function resolveFundOperationMode(profile: EastMoneyFundBasicInfo): FundOperationMode {
  const fundType = profile.FUNDTYPE ?? profile.BFUNDTYPE;
  if (fundType === '002') return 'closed_end';
  if (fundType === '003' || includesClosedPeriod(profile.SGZT) || includesClosedPeriod(profile.SHZT)) {
    return 'closed_period';
  }
  if (fundType === '001') return 'open';
  if (includesClosedPeriod(profile.SGZT) || includesClosedPeriod(profile.SHZT)) return 'closed_period';
  return 'unknown';
}

export function buildFundProfileSummary(profile: EastMoneyFundBasicInfo): FundProfileSummary {
  const operationMode = resolveFundOperationMode(profile);
  return {
    category: profile.FTYPE ?? null,
    operationMode,
    operationModeLabel: OPERATION_MODE_LABELS[operationMode],
    purchaseStatus: profile.SGZT ?? null,
    redemptionStatus: profile.SHZT ?? null,
    fundCompany: profile.JJGS ?? null,
    establishDate: profile.ESTABDATE ?? null,
    isListed: profile.ISLIST === '1' || profile.ISLISTTRADE === '1',
    riskLevel: profile.RISKLEVEL ?? null,
  };
}
