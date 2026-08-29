import type { InstrumentKind } from '../../shared/market/types';
import type { PortfolioLedgerEntry, PortfolioLedgerSide } from '../../shared/portfolio/types';

export interface PositionAggregate {
  symbol: string;
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

export function aggregatePositions(entries: readonly PortfolioLedgerEntry[]): PositionAggregate[] {
  const bySymbol = new Map<string, PortfolioLedgerEntry[]>();
  for (const entry of entries) {
    const list = bySymbol.get(entry.symbol) ?? [];
    list.push(entry);
    bySymbol.set(entry.symbol, list);
  }

  const positions: PositionAggregate[] = [];
  for (const [symbol, symbolEntries] of bySymbol) {
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
      symbol,
      kind: sorted[0]?.kind ?? 'stock',
      quantity,
      avgPrice: quantity > 0 ? totalPriceAmount / quantity : 0,
      avgCost: quantity > 0 ? totalCost / quantity : 0,
      totalCost,
      firstBuyAt,
    });
  }

  return positions.sort((a, b) => a.symbol.localeCompare(b.symbol));
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
