import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppDatabase } from '../src/service/database/database';

const temporaryDirectories: string[] = [];

function createDatabase(): AppDatabase {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'trading-workspace-'));
  temporaryDirectories.push(directory);
  return new AppDatabase(path.join(directory, 'database', 'app.sqlite'));
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe('交易工作台', () => {
  it('按计划状态创建入场、止损和目标提醒', () => {
    const database = createDatabase();
    const plan = database.createTradingPlan({
      symbol: '600519',
      name: '贵州茅台回踩',
      direction: 'long',
      thesis: '回踩支撑后按计划执行',
      entryPrice: 1450,
      stopPrice: 1392,
      targetPrice: 1580,
      riskAmount: 1200,
      activateNow: false,
    });

    expect(plan.status).toBe('draft');
    expect(database.listTradeAlerts()).toHaveLength(0);

    database.setTradingPlanStatus(plan.id, 'watching');
    expect(database.listTradeAlerts()).toMatchObject([
      { planId: plan.id, role: 'entry', condition: 'at_or_below', targetPrice: 1450, status: 'active' },
    ]);

    database.setTradingPlanStatus(plan.id, 'holding');
    const alerts = database.listTradeAlerts();
    expect(
      alerts
        .filter((alert) => alert.status === 'active')
        .map((alert) => alert.role)
        .sort(),
    ).toEqual(['stop', 'target']);
    expect(alerts.find((alert) => alert.role === 'entry')?.status).toBe('completed');
    database.close();
  });

  it('价格满足条件时只触发一次提醒', () => {
    const database = createDatabase();
    database.createTradeAlert({
      symbol: '510300',
      title: '进入定投区间',
      condition: 'at_or_below',
      targetPrice: 3.78,
    });

    expect(database.evaluatePrice('510300', 3.8)).toMatchObject({ evaluatedCount: 1, newlyTriggered: [] });
    const triggered = database.evaluatePrice('510300', 3.77);
    expect(triggered.newlyTriggered).toHaveLength(1);
    expect(triggered.newlyTriggered[0]).toMatchObject({ status: 'triggered', lastPrice: 3.77 });
    expect(database.evaluatePrice('510300', 3.75)).toMatchObject({ evaluatedCount: 0, newlyTriggered: [] });
    database.close();
  });

  it('复盘分别计算做多和做空盈亏并更新首页快照', () => {
    const database = createDatabase();
    const plan = database.createTradingPlan({
      symbol: 'AAPL',
      name: '财报后突破',
      direction: 'long',
      thesis: '突破确认后介入',
      entryPrice: 200,
      stopPrice: 190,
      targetPrice: 230,
      riskAmount: 500,
      activateNow: false,
    });
    database.setTradingPlanStatus(plan.id, 'watching');
    database.setTradingPlanStatus(plan.id, 'holding');
    database.setTradingPlanStatus(plan.id, 'completed');

    expect(database.workspaceSnapshot().pendingReviewCount).toBe(1);
    const review = database.createTradeReview({
      planId: plan.id,
      symbol: 'AAPL',
      title: '财报后突破复盘',
      direction: 'long',
      planned: true,
      entryPrice: 200,
      exitPrice: 212,
      quantity: 10,
      fees: 2,
      executionScore: 4,
      summary: '按突破计划入场并分批退出。',
      lesson: '下一次继续等待收盘确认。',
    });

    expect(review.pnl).toBe(118);
    expect(database.workspaceSnapshot()).toMatchObject({
      pendingReviewCount: 0,
      reviewedTradeCount: 1,
      totalPnl: 118,
      averageExecutionScore: 4,
    });
    database.close();
  });
});
