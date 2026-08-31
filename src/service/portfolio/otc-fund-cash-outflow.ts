import type { PortfolioLedgerEntry } from '../../shared/portfolio/types';

/** 单笔场外申购/定投的确认成本（份额×净值+手续费）。 */
export function computeOtcBuyNetCost(entry: Pick<PortfolioLedgerEntry, 'quantity' | 'price' | 'fees'>): number {
  return entry.quantity * entry.price + entry.fees;
}

/**
 * 计算场外买入的扣款金额（对齐蚂蚁/天天基金持仓成本）：
 * 优先使用显式 cashOutflow；否则在净成本接近整数扣款档（100/200…）时取整。
 */
export function resolveOtcBuyCashOutflow(
  entry: Pick<PortfolioLedgerEntry, 'kind' | 'side' | 'quantity' | 'price' | 'fees' | 'cashOutflow'>,
): number {
  if (entry.side !== 'buy') {
    return computeOtcBuyNetCost(entry);
  }

  if (entry.cashOutflow !== null && entry.cashOutflow !== undefined && entry.cashOutflow > 0) {
    return entry.cashOutflow;
  }

  const netCost = computeOtcBuyNetCost(entry);
  if (entry.kind !== 'otc_fund') {
    return netCost;
  }

  const rounded = Math.round(netCost);
  if (rounded > 0 && Math.abs(netCost - rounded) <= 0.15) {
    return rounded;
  }

  return netCost;
}

/** 从 AI/导入记录推断扣款金额。 */
export function inferOtcTradeCashOutflow(input: {
  amount: number | null;
  amountIsNetConfirmed: boolean;
  quantity: number;
  price: number;
  fees: number;
}): number | null {
  const netCost = input.quantity * input.price + input.fees;
  if (input.amount !== null && input.amount > 0) {
    if (input.amountIsNetConfirmed) {
      return input.amount + input.fees;
    }
    if (input.amount >= netCost - 0.02) {
      return input.amount;
    }
    return input.amount + input.fees;
  }

  const rounded = Math.round(netCost);
  if (rounded > 0 && Math.abs(netCost - rounded) <= 0.15) {
    return rounded;
  }

  return null;
}
