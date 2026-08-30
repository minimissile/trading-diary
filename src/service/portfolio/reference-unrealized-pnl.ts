import type { FeeProfileRates, FeeMarket } from '../../shared/accounts/types';
import type { InstrumentKind } from '../../shared/market/types';
import { estimateTradeFees } from '../accounts/fee-calculator';

const MONEY_SCALE = 100;

function toCents(yuan: number): number {
  return Math.round(yuan * MONEY_SCALE);
}

function fromCents(cents: number): number {
  return cents / MONEY_SCALE;
}

/** 由标的代码推断 A 股市场（用于预估卖出费用）。 */
export function inferMarketFromSymbol(symbol: string): 'SH' | 'SZ' | null {
  const normalized = symbol.trim().toUpperCase();
  if (normalized.startsWith('6')) return 'SH';
  if (normalized.startsWith('0') || normalized.startsWith('3')) return 'SZ';
  return null;
}

/**
 * 参考浮动盈亏（对齐券商 / 同花顺）：
 * 市值 − 成本基数 − 按当前价卖出的预估费用（与 estimateTradeFees 一致）。
 * 成本基数：场内为累计净投入（含历史卖出）；场外基金为持有总成本。
 */
export function computeReferenceUnrealizedPnl(input: {
  marketPrice: number;
  quantity: number;
  totalCost: number;
  kind: InstrumentKind;
  market: FeeMarket;
  feeProfile: FeeProfileRates;
}): number {
  const marketValueCents = toCents(input.marketPrice * input.quantity);
  const totalCostCents = toCents(input.totalCost);
  const grossCents = marketValueCents - totalCostCents;

  if (input.kind === 'otc_fund') {
    return fromCents(grossCents);
  }

  const { totalFees } = estimateTradeFees(
    {
      side: 'sell',
      market: input.market,
      price: input.marketPrice,
      quantity: input.quantity,
      instrumentKind: input.kind,
    },
    input.feeProfile,
  );
  return fromCents(grossCents - toCents(totalFees));
}

/** 参考收益率（对齐同花顺）= 参考浮盈 / 含费持仓总成本。 */
export function computeReferenceReturnPercent(unrealizedPnl: number, totalCost: number): number | null {
  if (totalCost <= 0) return null;
  return (unrealizedPnl / totalCost) * 100;
}
