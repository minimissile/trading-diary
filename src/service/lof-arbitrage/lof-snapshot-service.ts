import { getQuotesMulti } from '../market/market-router';
import { detectExchangeMarket, normalizeSymbol } from '../market/eastmoney/symbols';
import { isExchangeDailyPnlSessionActive } from '../../shared/trade-calendar';
import type { LofArbitrageSnapshot } from '../../shared/lof-arbitrage/types';
import { fetchFundTradingStatus } from './fund-trading-status';
import { evaluateArbitragePaths, pickRecommendedPath } from './feasibility-checker';
import { computePremiumRate, resolveReferenceNav } from './spread-calculator';
import type { LofSpotRow } from './lof-scanner';

export interface BuildLofSnapshotOptions {
  /** 预取的场内行情，用于全市场扫描加速。 */
  spot?: Pick<LofSpotRow, 'symbol' | 'name' | 'market' | 'marketPrice' | 'amount' | 'volume'>;
}

/**
 * 聚合单只 LOF 的套利快照（场内价 + 场外净值 + 申赎状态）。
 * @param symbolInput 6 位基金代码
 */
export async function buildLofSnapshot(
  symbolInput: string,
  options?: BuildLofSnapshotOptions,
): Promise<LofArbitrageSnapshot> {
  const symbol = normalizeSymbol(symbolInput);
  const fetchedAt = new Date().toISOString();
  const tradingSessionActive = isExchangeDailyPnlSessionActive(new Date(fetchedAt));

  const [exchangeQuote, otcQuote, tradingStatus] = await Promise.all([
    options?.spot
      ? Promise.resolve(null)
      : getQuotesMulti([{ symbol }]).then((quotes) => quotes[0] ?? null),
    getQuotesMulti([{ symbol, venue: 'OTC' }]).then((quotes) => quotes[0] ?? null),
    fetchFundTradingStatus(symbol),
  ]);

  const market = options?.spot?.market ?? detectExchangeMarket(symbol) ?? 'SZ';
  const name = options?.spot?.name ?? exchangeQuote?.name ?? otcQuote?.name ?? symbol;

  const marketPrice = options?.spot?.marketPrice ?? exchangeQuote?.price ?? null;
  const amount = options?.spot?.amount ?? exchangeQuote?.amount ?? null;
  const volume = options?.spot?.volume ?? exchangeQuote?.volume ?? null;

  const publishedNav = otcQuote?.nav ?? tradingStatus.publishedNav;
  const navDate = otcQuote?.navDate ?? tradingStatus.navDate;
  const estimatedNav = otcQuote?.estimatedNav ?? null;
  const estimatedNavChangePercent = otcQuote?.estimatedNavChangePercent ?? null;

  const { referenceNav, referenceNavSource } = resolveReferenceNav({
    publishedNav,
    estimatedNav,
    tradingSessionActive,
  });

  const premiumRate = computePremiumRate(marketPrice, referenceNav);
  const feasiblePaths = evaluateArbitragePaths({
    market,
    premiumRate,
    amount,
    subscriptionStatus: tradingStatus.subscriptionStatus,
    redemptionStatus: tradingStatus.redemptionStatus,
  });
  const recommendedPath = pickRecommendedPath(feasiblePaths);

  return {
    symbol,
    name,
    market,
    marketPrice,
    publishedNav,
    navDate,
    estimatedNav,
    estimatedNavChangePercent,
    referenceNav,
    referenceNavSource,
    premiumRate,
    amount,
    volume,
    subscriptionStatus: tradingStatus.subscriptionStatus,
    subscriptionStatusLabel: tradingStatus.subscriptionStatusLabel,
    redemptionStatus: tradingStatus.redemptionStatus,
    redemptionStatusLabel: tradingStatus.redemptionStatusLabel,
    feasiblePaths,
    recommendedPath,
    netSpread: recommendedPath?.estimatedNetSpread ?? null,
    fetchedAt,
  };
}

/**
 * 批量构建 LOF 快照（控制并发）。
 * @param symbols 基金代码列表
 */
export async function buildLofSnapshots(
  symbols: readonly string[],
  concurrency = 4,
): Promise<LofArbitrageSnapshot[]> {
  const unique = [...new Set(symbols.map(normalizeSymbol))];
  const results: LofArbitrageSnapshot[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < unique.length) {
      const current = unique[index];
      index += 1;
      if (!current) continue;
      try {
        results.push(await buildLofSnapshot(current));
      } catch {
        // 单只失败不影响批次
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, () => worker()));
  return results.sort((left, right) => Math.abs(right.premiumRate ?? 0) - Math.abs(left.premiumRate ?? 0));
}

/**
 * 全市场扫描：先拉 LOF 列表，再补充净值与申赎状态。
 * @param limit 最多扫描条数
 */
export async function scanLofArbitrageMarket(limit = 50): Promise<LofArbitrageSnapshot[]> {
  const { scanLofMarket } = await import('./lof-scanner');
  const spots = await scanLofMarket(limit);
  const snapshots: LofArbitrageSnapshot[] = [];

  for (const spot of spots) {
    try {
      snapshots.push(await buildLofSnapshot(spot.symbol, { spot }));
    } catch {
      // 跳过失败项
    }
  }

  return snapshots.sort((left, right) => Math.abs(right.premiumRate ?? 0) - Math.abs(left.premiumRate ?? 0));
}
