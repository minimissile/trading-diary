import type { AppDatabase } from '../database/database';
import type {
  CreateLofArbitrageRuleInput,
  LofArbitrageMonitorResult,
  LofArbitrageRule,
  LofArbitrageRuleStatus,
  LofArbitrageScanResult,
  LofArbitrageSnapshot,
  LofWatchItem,
} from '../../shared/lof-arbitrage/types';
import type { WorkspaceSnapshot } from '../../shared/api.types';
import { buildLofSnapshot, buildLofSnapshots, scanLofArbitrageMarket } from './lof-snapshot-service';
import { summarizeActionHint } from '../../shared/lof-arbitrage/action-hint';
import type { LofArbitrageDatabase } from './lof-arbitrage-database';

export class LofArbitrageService {
  constructor(private readonly store: LofArbitrageDatabase) {}

  listWatchItems(): LofWatchItem[] {
    return this.store.listWatchItems();
  }

  addWatchItem(symbol: string, notes?: string | null): LofWatchItem {
    return this.store.addWatchItem(symbol, notes);
  }

  removeWatchItem(id: string): void {
    this.store.removeWatchItem(id);
  }

  listRules(): LofArbitrageRule[] {
    return this.store.listRules();
  }

  createRule(input: CreateLofArbitrageRuleInput): LofArbitrageRule {
    return this.store.createRule(input);
  }

  setRuleStatus(id: string, status: LofArbitrageRuleStatus): LofArbitrageRule {
    return this.store.setRuleStatus(id, status);
  }

  deleteRule(id: string): void {
    this.store.deleteRule(id);
  }

  async getSnapshot(symbol: string): Promise<LofArbitrageSnapshot> {
    const snapshot = await buildLofSnapshot(symbol);
    this.store.saveSnapshot(snapshot);
    return snapshot;
  }

  async refreshMonitor(): Promise<LofArbitrageMonitorResult> {
    const watchItems = this.store.listWatchItems();
    const symbols = watchItems.map((item) => item.symbol);
    const positionSymbols = this.store.listHeldLofSymbols();

    const merged = [...new Set([...symbols, ...positionSymbols])];
    const snapshots = merged.length > 0 ? await buildLofSnapshots(merged) : [];

    for (const snapshot of snapshots) {
      this.store.saveSnapshot(snapshot);
    }

    return {
      watchItems,
      snapshots,
      rules: this.store.listRules(),
      fetchedAt: new Date().toISOString(),
    };
  }

  async scanMarket(limit = 120): Promise<LofArbitrageScanResult> {
    const snapshots = await scanLofArbitrageMarket(limit);
    for (const snapshot of snapshots) {
      this.store.saveSnapshot(snapshot);
    }
    return {
      snapshots,
      fetchedAt: new Date().toISOString(),
    };
  }

  listEvents(limit = 50) {
    return this.store.listRecentEvents(limit);
  }

  setEventAction(id: string, action: 'acknowledged' | 'dismissed') {
    return this.store.setEventAction(id, action);
  }

  extendWorkspaceSnapshot(snapshot: WorkspaceSnapshot, opportunities: LofArbitrageSnapshot[]): WorkspaceSnapshot {
    const actionable = opportunities.filter((item) => item.recommendedPath !== null);
    return {
      ...snapshot,
      lofArbitrageOpportunities: actionable.slice(0, 3),
      lofArbitrageTriggeredCount: this.store.listPendingEvents(20).length,
    };
  }

  buildAlertTitle(snapshot: LofArbitrageSnapshot): string {
    const hint = summarizeActionHint(snapshot.premiumRate, snapshot.feasiblePaths, snapshot.recommendedPath);
    if (snapshot.premiumRate === null) return `${snapshot.name} · 数据更新`;
    const rateText = `${(snapshot.premiumRate * 100).toFixed(2)}%`;
    return snapshot.premiumRate >= 0
      ? `${snapshot.name} 溢价 ${rateText} · ${hint}`
      : `${snapshot.name} 折价 ${rateText} · ${hint}`;
  }
}

export function createLofArbitrageService(database: AppDatabase): LofArbitrageService {
  return new LofArbitrageService(database.lofArbitrage);
}
