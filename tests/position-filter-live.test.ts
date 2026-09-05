import { snapshotTestDatabase } from './database-snapshot';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AppDatabase } from '../src/service/database/database';
import { PortfolioService } from '../src/service/portfolio/portfolio-service';

const DB_PATH = process.env.TRADING_DIARY_TEST_DB ?? '';

type AssetCategory = 'all' | 'fund' | 'stock';
type StockSubKind = 'all' | 'stock' | 'listed_fund';

function matchesAssetFilter(position: { kind: string }, category: AssetCategory, stockSubKind: StockSubKind): boolean {
  if (category === 'all') return true;
  if (category === 'fund') return position.kind === 'otc_fund';
  if (position.kind === 'otc_fund') return false;
  if (stockSubKind === 'all') return true;
  if (stockSubKind === 'stock') return position.kind === 'stock';
  return position.kind === 'etf' || position.kind === 'lof';
}

describe.skipIf(!existsSync(DB_PATH))('positions tab filter live', () => {
  it('reports fund tab market value mismatch', async () => {
    const svc = new PortfolioService(new AppDatabase(await snapshotTestDatabase(DB_PATH)));
    const positions = await svc.listPositions(undefined);

    const fundTab = positions.filter((p) => matchesAssetFilter(p, 'fund', 'all'));
    const stockTab = positions.filter((p) => matchesAssetFilter(p, 'stock', 'all'));

    const fundMv = fundTab.reduce((sum, p) => sum + (p.marketValue ?? 0), 0);
    const fundCost = fundTab.reduce((sum, p) => sum + p.avgCost * p.quantity, 0);
    const stockMv = stockTab.reduce((sum, p) => sum + (p.marketValue ?? 0), 0);

    console.log({
      total: positions.length,
      fundTab: fundTab.length,
      stockTab: stockTab.length,
      fundMv,
      fundCost,
      stockMv,
      fundKinds: [...new Set(fundTab.map((p) => p.kind))],
      fundSample: fundTab.slice(0, 5).map((p) => ({
        symbol: p.symbol,
        name: p.name,
        kind: p.kind,
        mv: p.marketValue,
        cost: p.avgCost * p.quantity,
      })),
      etfInFundTab: fundTab.filter((p) => p.name.includes('ETF')).map((p) => p.symbol),
    });

    expect(positions.length).toBeGreaterThan(0);
  });
});
