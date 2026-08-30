import type { InstrumentKind } from '../../shared/market/types';
import type { InstrumentVenue } from '../../shared/market/venues';
import { instrumentPositionKey } from '../../shared/market/instrument-id';
import type { PortfolioLedgerEntry, PortfolioLedgerSide } from '../../shared/portfolio/types';

export interface PositionAggregate {
  symbol: string;
  venue: InstrumentVenue;
  kind: InstrumentKind;
  quantity: number;
  /** 不含费用的加权成交均价（对齐券商「成本价」展示）。 */
  avgPrice: number;
  /** 含买入费用的摊薄成本。 */
  avgCost: number;
  totalCost: number;
  firstBuyAt: string | null;
}

export interface LedgerLine {
  tradeAt: string;
  quantityDelta: number;
  price: number;
  side: PortfolioLedgerSide;
}

function sortedEntries(entries: readonly PortfolioLedgerEntry[]): PortfolioLedgerEntry[] {
  return [...entries].sort((a, b) => {
    const timeDiff = a.tradeAt.localeCompare(b.tradeAt);
    if (timeDiff !== 0) return timeDiff;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function ledgerQuantityDelta(entry: PortfolioLedgerEntry): number {
  if (entry.side === 'sell') return -Math.abs(entry.quantity);
  return Math.abs(entry.quantity);
}

/**
 * 场内标的累计净投入（对齐同花顺 / 券商「持仓盈亏」）：
 * 买入金额 + 买入费用 − 卖出到账（成交金额 − 卖出费用）− 已到账现金分红。
 * 部分卖出后仍与「市值 − 净投入」口径一致；仅买入时与剩余持仓总成本相同。
 */
export function computeExchangeTradedNetCashInvested(
  entries: readonly PortfolioLedgerEntry[],
  cashDividendsReceived = 0,
): number {
  let net = 0;
  for (const entry of sortedEntries(entries)) {
    if (entry.side === 'buy') {
      net += entry.quantity * entry.price + entry.fees;
      continue;
    }
    if (entry.side === 'sell') {
      net -= entry.quantity * entry.price - entry.fees;
    }
  }
  return net - cashDividendsReceived;
}

export function aggregatePositions(entries: readonly PortfolioLedgerEntry[]): PositionAggregate[] {
  const byKey = new Map<string, PortfolioLedgerEntry[]>();
  for (const entry of entries) {
    const key = instrumentPositionKey(entry);
    const list = byKey.get(key) ?? [];
    list.push(entry);
    byKey.set(key, list);
  }

  const positions: PositionAggregate[] = [];
  for (const [key, symbolEntries] of byKey) {
    const sorted = sortedEntries(symbolEntries);
    let quantity = 0;
    let totalCost = 0;
    let totalPriceAmount = 0;
    let firstBuyAt: string | null = null;

    for (const entry of sorted) {
      const delta = ledgerQuantityDelta(entry);
      if (delta > 0) {
        if (firstBuyAt === null) firstBuyAt = entry.tradeAt;
        totalCost += delta * entry.price + entry.fees;
        totalPriceAmount += delta * entry.price;
        quantity += delta;
      } else {
        const sellQty = Math.abs(delta);
        if (quantity <= 0) continue;
        const consumed = Math.min(sellQty, quantity);
        const avg = quantity > 0 ? totalCost / quantity : 0;
        const avgPrice = quantity > 0 ? totalPriceAmount / quantity : 0;
        totalCost -= avg * consumed;
        totalPriceAmount -= avgPrice * consumed;
        quantity -= consumed;
        if (quantity <= 1e-8) {
          quantity = 0;
          totalCost = 0;
          totalPriceAmount = 0;
        }
      }
    }

    if (quantity <= 1e-8) continue;

    positions.push({
      symbol: sorted[0]?.symbol ?? key.split(':')[1] ?? '',
      venue: sorted[0]?.venue ?? 'SH',
      kind: sorted[0]?.kind ?? 'stock',
      quantity,
      avgPrice: quantity > 0 ? totalPriceAmount / quantity : 0,
      avgCost: quantity > 0 ? totalCost / quantity : 0,
      totalCost,
      firstBuyAt,
    });
  }

  return positions.sort((a, b) =>
    instrumentPositionKey(a).localeCompare(instrumentPositionKey(b)),
  );
}

export function snapshotQuantityAt(entries: readonly PortfolioLedgerEntry[], asOfDate: string): number {
  const cutoff = `${asOfDate}T23:59:59.999Z`;
  const relevant = sortedEntries(entries).filter((entry) => entry.tradeAt <= cutoff);
  let quantity = 0;

  for (const entry of relevant) {
    const delta = ledgerQuantityDelta(entry);
    if (delta > 0) {
      quantity += delta;
    } else {
      quantity = Math.max(0, quantity - Math.abs(delta));
    }
  }

  return quantity;
}

export function recordDateFromExDate(exDividendDate: string): string {
  const date = new Date(`${exDividendDate}T12:00:00`);
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function daysElapsedInYear(year: number, now = new Date()): number {
  const start = new Date(`${year}-01-01T00:00:00`);
  const end = now.getFullYear() === year ? now : new Date(`${year}-12-31T23:59:59`);
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.floor(ms / 86_400_000) + 1);
}

/**
 * 场外基金「持有单价」口径（对齐支付宝/天天基金）：
 * (累计现金申购 − 已到账现金分红) ÷ 当前份额；红利再投只增份额、不增成本基数。
 */
export function computeOtcFundHoldMetrics(
  entries: readonly PortfolioLedgerEntry[],
  cashDividendsReceived: number,
): { holdPrice: number; totalCost: number; cashInvested: number } {
  const sorted = sortedEntries(entries);
  let cashInvested = 0;
  let quantity = 0;

  for (const entry of sorted) {
    if (entry.side === 'buy') {
      cashInvested += entry.quantity * entry.price + entry.fees;
      quantity += entry.quantity;
      continue;
    }
    if (entry.side === 'dividend_reinvest') {
      quantity += entry.quantity;
      continue;
    }
    const sellQty = Math.abs(entry.quantity);
    if (quantity <= 0) continue;
    const consumed = Math.min(sellQty, quantity);
    const avgInvested = cashInvested / quantity;
    cashInvested -= avgInvested * consumed;
    quantity -= consumed;
    if (quantity <= 1e-8) {
      quantity = 0;
      cashInvested = 0;
    }
  }

  if (quantity <= 1e-8) {
    return { holdPrice: 0, totalCost: 0, cashInvested: 0 };
  }

  const totalCost = Math.max(0, cashInvested - cashDividendsReceived);
  return {
    holdPrice: totalCost / quantity,
    totalCost,
    cashInvested,
  };
}
