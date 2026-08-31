import type { AppDatabase } from '../database/database';
import { isExchangeDailyPnlSessionActive } from '../../shared/trade-calendar';
import type { LofArbitragePollResult, LofArbitrageSnapshot } from '../../shared/lof-arbitrage/types';
import {
  isExecutableArbitrage,
  snapshotMatchesExecutableRule,
} from '../../shared/lof-arbitrage/executable';
import { buildLofSnapshots, scanLofArbitrageMarket } from './lof-snapshot-service';
import { createLofArbitrageService } from './lof-arbitrage-service';

const MARKET_SCAN_LIMIT = 150;
const TRIGGER_COOLDOWN_MS = 30 * 60 * 1000;

function mergeSnapshotsBySymbol(
  primary: readonly LofArbitrageSnapshot[],
  extra: readonly LofArbitrageSnapshot[],
): LofArbitrageSnapshot[] {
  const map = new Map<string, LofArbitrageSnapshot>();
  for (const snapshot of primary) {
    map.set(snapshot.symbol, snapshot);
  }
  for (const snapshot of extra) {
    map.set(snapshot.symbol, snapshot);
  }
  return [...map.values()];
}

/**
 * 轮询全市场（若有全市场规则）与监控池，仅对可执行套利触发提醒。
 */
export async function pollLofArbitrage(database: AppDatabase): Promise<LofArbitragePollResult> {
  if (!isExchangeDailyPnlSessionActive()) {
    return { evaluatedSymbolCount: 0, newlyTriggered: [] };
  }

  database.lofArbitrage.ensureDefaultExecutableAlertRule();

  const service = createLofArbitrageService(database);
  const activeRules = database.lofArbitrage.listActiveRules();
  if (activeRules.length === 0) {
    return { evaluatedSymbolCount: 0, newlyTriggered: [] };
  }

  const hasMarketWideRule = activeRules.some((rule) => !rule.symbol);
  const watchSymbols = database.lofArbitrage.listWatchItems().map((item) => item.symbol);
  const ruleSymbols = activeRules.flatMap((rule) => (rule.symbol ? [rule.symbol] : []));
  const specificSymbols = [...new Set([...watchSymbols, ...ruleSymbols])];

  let snapshots: LofArbitrageSnapshot[] = [];

  if (hasMarketWideRule) {
    snapshots = await scanLofArbitrageMarket(MARKET_SCAN_LIMIT);
  }

  if (specificSymbols.length > 0) {
    const specificSnapshots = await buildLofSnapshots(specificSymbols);
    snapshots = mergeSnapshotsBySymbol(snapshots, specificSnapshots);
  }

  if (snapshots.length === 0) {
    return { evaluatedSymbolCount: 0, newlyTriggered: [] };
  }

  const newlyTriggered = [];

  for (const snapshot of snapshots) {
    database.lofArbitrage.saveSnapshot(snapshot);
    if (!isExecutableArbitrage(snapshot)) continue;

    for (const rule of activeRules) {
      if (!snapshotMatchesExecutableRule(snapshot, rule)) continue;
      if (database.lofArbitrage.hasRecentTrigger(rule.id, snapshot.symbol, TRIGGER_COOLDOWN_MS)) continue;

      const event = database.lofArbitrage.recordTrigger({
        ruleId: rule.id,
        symbol: snapshot.symbol,
        title: service.buildAlertTitle(snapshot),
        premiumRate: snapshot.premiumRate!,
        netSpread: snapshot.netSpread,
        recommendedPathLabel: snapshot.recommendedPath?.label ?? null,
      });
      newlyTriggered.push(event);
      break;
    }
  }

  return {
    evaluatedSymbolCount: snapshots.length,
    newlyTriggered,
  };
}
