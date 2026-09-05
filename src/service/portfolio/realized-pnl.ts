import type {
  ClosedPositionSummary,
  PortfolioLedgerEntry,
  PortfolioRealizedHistoryView,
  RealizedHistorySummary,
  RealizedTradeView,
} from '../../shared/portfolio/types';
import { aggregatePositions, ledgerQuantityDelta } from './ledger-service';
import { computeTTradingPnlForSell, createTBuyLot, supportsTTrading, tTradingDayKey, type TBuyLotMutable } from './t-trading-pnl';

type RealizedTradeCore = Omit<RealizedTradeView, 'name'>;
type ClosedPositionCore = Omit<ClosedPositionSummary, 'name'>;

export function positionGroupKey(accountId: string, symbol: string): string {
  return `${accountId}:${symbol}`;
}

function sortedEntries(entries: readonly PortfolioLedgerEntry[]): PortfolioLedgerEntry[] {
  return [...entries].sort((a, b) => {
    const timeDiff = a.tradeAt.localeCompare(b.tradeAt);
    if (timeDiff !== 0) return timeDiff;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

/** 按账户+标的 walk ledger，计算每笔卖出的已实现盈亏（与 aggregatePositions 成本算法一致）。 */
export function computeRealizedTrades(entries: readonly PortfolioLedgerEntry[]): RealizedTradeCore[] {
  const groups = new Map<string, PortfolioLedgerEntry[]>();
  for (const entry of entries) {
    const key = positionGroupKey(entry.accountId, entry.symbol);
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }

  const trades: RealizedTradeCore[] = [];

  for (const symbolEntries of groups.values()) {
    const sorted = sortedEntries(symbolEntries);
    let quantity = 0;
    let totalCost = 0;
    const tBuyLotsByDay = new Map<string, TBuyLotMutable[]>();

    for (const entry of sorted) {
      const delta = ledgerQuantityDelta(entry);
      if (delta > 0) {
        quantity += delta;
        totalCost += delta * entry.price + entry.fees;
        if (supportsTTrading(entry.kind)) {
          const dayKey = tTradingDayKey(entry);
          const lots = tBuyLotsByDay.get(dayKey) ?? [];
          lots.push(createTBuyLot(entry, delta));
          tBuyLotsByDay.set(dayKey, lots);
        }
        continue;
      }

      const sellQty = Math.min(Math.abs(delta), quantity);
      if (sellQty <= 1e-8) continue;

      const avgCost = totalCost / quantity;
      const costBasis = avgCost * sellQty;
      const grossProceeds = sellQty * entry.price;
      const sellFees = entry.fees;
      const realizedPnl = grossProceeds - sellFees - costBasis;
      const tTradingPnl = supportsTTrading(entry.kind)
        ? computeTTradingPnlForSell(entry, sellQty, tBuyLotsByDay.get(tTradingDayKey(entry)) ?? [])
        : null;

      totalCost -= avgCost * sellQty;
      quantity -= sellQty;
      if (quantity <= 1e-8) {
        quantity = 0;
        totalCost = 0;
      }

      trades.push({
        id: entry.id,
        accountId: entry.accountId,
        symbol: entry.symbol,
        kind: entry.kind,
        tradeAt: entry.tradeAt,
        quantity: sellQty,
        sellPrice: entry.price,
        sellFees,
        proceeds: grossProceeds - sellFees,
        costBasis,
        realizedPnl,
        tTradingPnl,
        returnPercent: costBasis > 0 ? (realizedPnl / costBasis) * 100 : null,
        note: entry.note,
        remainingQuantity: quantity,
      });
    }
  }

  return trades.sort((a, b) => b.tradeAt.localeCompare(a.tradeAt));
}

export function collectOpenPositionKeys(entries: readonly PortfolioLedgerEntry[]): Set<string> {
  const openKeys = new Set<string>();
  const accountGroups = new Map<string, PortfolioLedgerEntry[]>();
  for (const entry of entries) {
    const list = accountGroups.get(entry.accountId) ?? [];
    list.push(entry);
    accountGroups.set(entry.accountId, list);
  }
  for (const [accountId, accountEntries] of accountGroups) {
    for (const position of aggregatePositions(accountEntries)) {
      openKeys.add(positionGroupKey(accountId, position.symbol));
    }
  }
  return openKeys;
}

export function computeClosedPositionSummaries(
  trades: readonly RealizedTradeCore[],
  openKeys: ReadonlySet<string>,
): ClosedPositionCore[] {
  const byKey = new Map<string, RealizedTradeCore[]>();

  for (const trade of trades) {
    const key = positionGroupKey(trade.accountId, trade.symbol);
    if (openKeys.has(key)) continue;
    const list = byKey.get(key) ?? [];
    list.push(trade);
    byKey.set(key, list);
  }

  const summaries: ClosedPositionCore[] = [];

  for (const symbolTrades of byKey.values()) {
    const sorted = [...symbolTrades].sort((a, b) => a.tradeAt.localeCompare(b.tradeAt));
    summaries.push({
      accountId: sorted[0]!.accountId,
      symbol: sorted[0]!.symbol,
      kind: sorted[0]!.kind,
      totalRealizedPnl: sorted.reduce((sum, item) => sum + item.realizedPnl, 0),
      sellCount: sorted.length,
      totalQuantitySold: sorted.reduce((sum, item) => sum + item.quantity, 0),
      firstSellAt: sorted[0]!.tradeAt,
      lastSellAt: sorted[sorted.length - 1]!.tradeAt,
    });
  }

  return summaries.sort((a, b) => b.lastSellAt.localeCompare(a.lastSellAt));
}

export function summarizeRealizedTrades(trades: readonly RealizedTradeCore[]): RealizedHistorySummary {
  let winCount = 0;
  let lossCount = 0;
  let totalRealizedPnl = 0;

  for (const trade of trades) {
    totalRealizedPnl += trade.realizedPnl;
    if (trade.realizedPnl > 0) winCount += 1;
    else if (trade.realizedPnl < 0) lossCount += 1;
  }

  return {
    totalRealizedPnl,
    tradeCount: trades.length,
    winCount,
    lossCount,
  };
}

export function buildRealizedHistory(
  entries: readonly PortfolioLedgerEntry[],
  year?: number,
): Omit<PortfolioRealizedHistoryView, 'trades' | 'closedPositions'> & {
  trades: RealizedTradeCore[];
  closedPositions: ClosedPositionCore[];
} {
  const allTrades = computeRealizedTrades(entries);
  const trades = year ? allTrades.filter((trade) => trade.tradeAt.slice(0, 4) === String(year)) : allTrades;

  const openKeys = collectOpenPositionKeys(entries);
  const allClosed = computeClosedPositionSummaries(allTrades, openKeys);
  const closedPositions = year ? allClosed.filter((item) => item.lastSellAt.slice(0, 4) === String(year)) : allClosed;

  return {
    trades,
    closedPositions,
    summary: summarizeRealizedTrades(trades),
  };
}
