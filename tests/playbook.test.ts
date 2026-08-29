import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppDatabase } from '../src/service/database/database';

const temporaryDirectories: string[] = [];

function createDatabase(): AppDatabase {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'trading-playbook-'));
  temporaryDirectories.push(directory);
  return new AppDatabase(path.join(directory, 'database', 'app.sqlite'));
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe('规则库', () => {
  it('复盘完成后可写入规则库', () => {
    const database = createDatabase();

    database.episodes.addExecution({
      symbol: '600519',
      side: 'buy',
      quantity: 100,
      price: 1500,
      tradeAt: '2026-03-10T09:31:00.000Z',
    });
    database.episodes.addExecution({
      symbol: '600519',
      side: 'sell',
      quantity: 100,
      price: 1580,
      tradeAt: '2026-03-15T14:55:00.000Z',
    });

    const episode = database.episodes.listPendingReview()[0];
    expect(episode).toBeDefined();

    database.createTradeReview({
      planId: null,
      episodeId: episode!.id,
      symbol: '600519',
      title: '茅台复盘',
      direction: 'long',
      planned: false,
      entryPrice: 1500,
      exitPrice: 1580,
      quantity: 100,
      fees: 10,
      executionScore: 4,
      summary: '按计划执行',
      lesson: '突破前高必须放量确认',
      saveToPlaybook: true,
    });

    const rules = database.playbook.listRules('active');
    expect(rules).toHaveLength(1);
    expect(rules[0]?.content).toBe('突破前高必须放量确认');
    expect(rules[0]?.sourceReviewId).toBeTruthy();
    database.close();
  });

  it('激活计划前可获取相关检查清单', () => {
    const database = createDatabase();
    database.playbook.createRule({
      content: '全局规则：单笔风险不超过 2%',
      category: 'position',
      checkTiming: 'plan_activation',
    });
    database.playbook.createRule({
      content: '600519 专用：不追涨停',
      category: 'entry',
      symbol: '600519',
      checkTiming: 'plan_activation',
    });
    const archivedRule = database.playbook.createRule({
      content: '已归档规则',
      category: 'process',
      checkTiming: 'plan_activation',
    });
    database.playbook.archiveRule(archivedRule.id);

    const checklist = database.playbook.listActivationChecklist('600519');
    expect(checklist).toHaveLength(2);
    expect(checklist.some((rule) => rule.symbol === '600519')).toBe(true);
    database.close();
  });
});

describe('提醒触发历史', () => {
  it('价格触发时会写入不可变事件', () => {
    const database = createDatabase();
    database.createTradeAlert({
      symbol: '510300',
      title: 'ETF 突破',
      condition: 'at_or_above',
      targetPrice: 4.2,
    });

    const result = database.evaluatePrice('510300', 4.25);
    expect(result.newlyTriggered).toHaveLength(1);
    expect(result.newlyTriggeredEvents).toHaveLength(1);

    const events = database.alertEvents.listEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.triggerPrice).toBe(4.25);
    expect(events[0]?.targetPrice).toBe(4.2);
    database.close();
  });
});
