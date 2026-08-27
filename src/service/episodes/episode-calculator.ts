import type { ExecutionSide, TradeEpisodeStatus } from '../../shared/episodes/types';
import type { TradeDirection } from '../../shared/api.types';

export interface ExecutionMetricsInput {
  side: ExecutionSide;
  quantity: number;
  price: number;
  fees: number;
  tradeAt: string;
}

export interface EpisodeMetrics {
  netQuantity: number;
  avgEntryPrice: number | null;
  avgExitPrice: number | null;
  closedQuantity: number;
  totalFees: number;
  realizedPnl: number | null;
  status: TradeEpisodeStatus;
}

function sortedExecutions<T extends ExecutionMetricsInput>(executions: readonly T[]): T[] {
  return [...executions].sort((a, b) => a.tradeAt.localeCompare(b.tradeAt));
}

function signedDelta(direction: TradeDirection, side: ExecutionSide, quantity: number): number {
  const amount = Math.abs(quantity);
  if (direction === 'long') return side === 'buy' ? amount : -amount;
  return side === 'sell' ? amount : -amount;
}

/**
 * 根据成交流水计算回合持仓、均价与已实现盈亏。
 * 做多：买入增仓、卖出减仓；全部平仓后 realizedPnl 为扣除费用后的净盈亏。
 */
export function computeEpisodeMetrics(
  direction: TradeDirection,
  executions: readonly ExecutionMetricsInput[],
): EpisodeMetrics {
  const ordered = sortedExecutions(executions);
  let netQuantity = 0;
  let openCost = 0;
  let buyQty = 0;
  let buyNotional = 0;
  let sellQty = 0;
  let sellNotional = 0;
  let totalFees = 0;
  let realizedPnl = 0;

  for (const execution of ordered) {
    const quantity = Math.abs(execution.quantity);
    totalFees += execution.fees;
    const delta = signedDelta(direction, execution.side, quantity);

    if (delta > 0) {
      if (netQuantity <= 0) {
        netQuantity = 0;
        openCost = 0;
      }
      openCost += delta * execution.price + execution.fees;
      netQuantity += delta;
      buyQty += delta;
      buyNotional += delta * execution.price;
      continue;
    }

    const closingQty = Math.min(Math.abs(delta), netQuantity > 0 ? netQuantity : 0);
    if (closingQty <= 0) continue;

    const avgCost = netQuantity > 0 ? openCost / netQuantity : execution.price;
    const proceeds = closingQty * execution.price - (execution.fees * closingQty) / quantity;
    const costBasis = avgCost * closingQty;
    realizedPnl += direction === 'long' ? proceeds - costBasis : costBasis - proceeds;

    openCost -= avgCost * closingQty;
    netQuantity -= closingQty;
    sellQty += closingQty;
    sellNotional += closingQty * execution.price;

    if (netQuantity <= 1e-8) {
      netQuantity = 0;
      openCost = 0;
    }
  }

  const closedQuantity = Math.min(buyQty, sellQty);
  const status: TradeEpisodeStatus = netQuantity <= 1e-8 ? 'closed' : 'open';

  return {
    netQuantity: netQuantity <= 1e-8 ? 0 : netQuantity,
    avgEntryPrice: buyQty > 0 ? buyNotional / buyQty : null,
    avgExitPrice: sellQty > 0 ? sellNotional / sellQty : null,
    closedQuantity,
    totalFees,
    realizedPnl: status === 'closed' && closedQuantity > 0 ? realizedPnl : null,
    status,
  };
}
