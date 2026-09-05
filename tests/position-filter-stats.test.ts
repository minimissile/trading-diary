import { describe, expect, it } from 'vitest';
import type { InstrumentKind } from '../src/shared/market/types';
import type { PortfolioPositionView } from '../src/shared/portfolio/types';

type AssetCategory = 'all' | 'fund' | 'stock';
type StockSubKind = 'all' | 'stock' | 'listed_fund';

function isFundKind(kind: InstrumentKind): boolean {
  return kind === 'otc_fund' || kind === 'etf' || kind === 'lof';
}

function matchesAssetFilter(position: PortfolioPositionView, category: AssetCategory, stockSubKind: StockSubKind): boolean {
  if (category === 'all') return true;
  if (category === 'fund') {
    if (!isFundKind(position.kind)) return false;
    if (stockSubKind === 'all') return true;
    if (stockSubKind === 'listed_fund') return position.kind === 'etf' || position.kind === 'lof';
    return position.kind === 'otc_fund';
  }
  if (isFundKind(position.kind)) return false;
  if (stockSubKind === 'all') return true;
  return position.kind === 'stock';
}

function aggregatePortfolioStats(rows: readonly PortfolioPositionView[]) {
  let totalMarketValue = 0;
  let totalCost = 0;
  let unrealizedPnl = 0;
  for (const row of rows) {
    totalMarketValue += row.marketValue ?? 0;
    totalCost += row.avgCost * row.quantity;
    unrealizedPnl += row.unrealizedPnl ?? 0;
  }
  return { totalMarketValue, totalCost, unrealizedPnl, positionCount: rows.length };
}

function position(
  partial: Partial<PortfolioPositionView> & Pick<PortfolioPositionView, 'symbol' | 'kind'>,
): PortfolioPositionView {
  return {
    venue: 'SH',
    quoteCurrency: 'CNY',
    name: partial.symbol,
    quantity: 100,
    avgPrice: 10,
    avgCost: 10,
    marketPrice: 11,
    marketValue: 1100,
    unrealizedPnl: 100,
    unrealizedReturnPercent: 10,
    dailyPnl: 5,
    expectedDividend: 0,
    fundProfile: null,
    firstBuyAt: null,
    ytdDividendReceived: 0,
    dividendYieldTtm: null,
    ...partial,
  };
}

describe('position filter stats', () => {
  const rows = [
    position({ symbol: '600000', kind: 'stock' }),
    position({ symbol: '159915', kind: 'etf' }),
    position({ symbol: '021972', kind: 'otc_fund', marketValue: 2000, avgCost: 9 }),
  ];

  it('aggregates tab-filtered positions', () => {
    const all = aggregatePortfolioStats(rows);
    const fundTab = aggregatePortfolioStats(rows.filter((row) => matchesAssetFilter(row, 'fund', 'all')));
    const otcFundTab = aggregatePortfolioStats(rows.filter((row) => matchesAssetFilter(row, 'fund', 'stock')));
    const listedFundTab = aggregatePortfolioStats(rows.filter((row) => matchesAssetFilter(row, 'fund', 'listed_fund')));
    const stockTab = aggregatePortfolioStats(rows.filter((row) => matchesAssetFilter(row, 'stock', 'all')));

    expect(all.positionCount).toBe(3);
    expect(fundTab.positionCount).toBe(2);
    expect(otcFundTab.positionCount).toBe(1);
    expect(listedFundTab.positionCount).toBe(1);
    expect(stockTab.positionCount).toBe(1);

    expect(all.totalMarketValue).toBe(1100 + 1100 + 2000);
    expect(fundTab.totalMarketValue).toBe(3100);
    expect(stockTab.totalMarketValue).toBe(1100);
    expect(fundTab.unrealizedPnl).toBeGreaterThan(stockTab.unrealizedPnl);
  });
});
