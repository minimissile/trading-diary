import type { InstrumentKind } from '../../shared/market/types';
import { nextTradingDay, tradeCalendarDate } from '../../shared/trade-calendar';
import type { LedgerAiTradeChannel } from '../../shared/portfolio/ledger-import-types';
import type { LedgerAiExtractedRecord } from '../../shared/portfolio/ledger-import-types';

export function isOtcTradeChannel(channel: LedgerAiTradeChannel): boolean {
  return channel === 'otc';
}

/** @deprecated 按交易渠道判断，见 isOtcTradeChannel */
export function isFundLikeKind(kind: InstrumentKind): boolean {
  return kind === 'otc_fund' || kind === 'lof';
}

/** 场外/LOF 申购：按下一交易日净值确认（对齐蚂蚁/天天基金）。 */
export function resolveFundConfirmationNavDate(tradeAt: string): string {
  return nextTradingDay(tradeCalendarDate(tradeAt));
}

/** 净值查询日：有确认日直接用确认日，否则由申请日推算 T+1。 */
export function resolveFundNavLookupDate(tradeAt: string | null, confirmAt: string | null): string | null {
  if (confirmAt) return tradeCalendarDate(confirmAt);
  if (tradeAt) return resolveFundConfirmationNavDate(tradeAt);
  return null;
}

/** 蚂蚁等平台常见申购费率：0.1%，单笔至少 0.01 元。 */
export function estimateOtcSubscriptionFee(amount: number): number {
  if (amount <= 0) return 0;
  return Math.max(0.01, Math.round(amount * 0.001 * 100) / 100);
}

/** 是否已有场外基金确认口径（净值+份额或确认金额）。 */
export function hasFundConfirmationData(
  record: Pick<
    LedgerAiExtractedRecord,
    'price' | 'quantity' | 'confirmAt' | 'amountIsNetConfirmed'
  >,
): boolean {
  return record.price !== null && record.quantity !== null;
}

/** 列表页定投/申购是否可据金额 + T+1 净值推导。 */
export function canDeriveFundFromAmount(
  record: Pick<LedgerAiExtractedRecord, 'recordKind' | 'amount' | 'price' | 'quantity'>,
): boolean {
  return record.recordKind === 'sip_deduction' && record.amount !== null && record.price === null;
}

/** 根据确认金额与净值计算份额（保留 2 位小数）。 */
export function resolveInvestableAmount(
  amount: number,
  fees: number,
  amountIsNetConfirmed: boolean,
): number {
  if (amountIsNetConfirmed) return amount;
  return Math.max(0, amount - fees);
}

/** 根据确认金额与净值计算份额（保留 2 位小数）。 */
export function computeFundQuantityFromAmount(
  amount: number,
  nav: number,
  fees = 0,
  amountIsNetConfirmed = false,
): number {
  if (nav <= 0) throw new Error('净值必须大于 0');
  const investable = resolveInvestableAmount(amount, fees, amountIsNetConfirmed);
  return Math.round((investable / nav) * 100) / 100;
}
