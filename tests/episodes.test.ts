import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppDatabase } from '../src/service/database/database';
import { computeEpisodeMetrics } from '../src/service/episodes/episode-calculator';

const temporaryDirectories: string[] = [];

function createDatabase(): AppDatabase {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'trading-episodes-'));
  temporaryDirectories.push(directory);
  return new AppDatabase(path.join(directory, 'database', 'app.sqlite'));
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe('交易回合计算', () => {
  it('分批买入卖出后计算已实现盈亏', () => {
    const metrics = computeEpisodeMetrics('long', [
      { side: 'buy', quantity: 100, price: 10, fees: 5, tradeAt: '2026-01-02T09:31:00.000Z' },
      { side: 'buy', quantity: 100, price: 11, fees: 5, tradeAt: '2026-01-03T09:31:00.000Z' },
      { side: 'sell', quantity: 200, price: 12, fees: 8, tradeAt: '2026-01-05T14:55:00.000Z' },
    ]);

    expect(metrics.status).toBe('closed');
    expect(metrics.netQuantity).toBe(0);
    expect(metrics.closedQuantity).toBe(200);
    expect(metrics.avgEntryPrice).toBe(10.5);
    expect(metrics.avgExitPrice).toBe(12);
    expect(metrics.realizedPnl).toBeCloseTo(282, 0);
  });
});

describe('交易回合服务', () => {
  it('录入买卖成交后自动归组并在平仓时进入待复盘', () => {
    const database = createDatabase();

    database.episodes.addExecution({
      symbol: '600519',
      side: 'buy',
      quantity: 100,
      price: 1500,
      fees: 5,
      tradeAt: '2026-03-10T09:31:00.000Z',
    });

    const open = database.episodes.listEpisodes().find((episode) => episode.symbol === '600519');
    expect(open?.status).toBe('open');
    expect(open?.netQuantity).toBe(100);

    const closed = database.episodes.addExecution({
      symbol: '600519',
      side: 'sell',
      quantity: 100,
      price: 1580,
      fees: 8,
      tradeAt: '2026-03-15T14:55:00.000Z',
    });

    expect(closed.status).toBe('closed');
    expect(closed.realizedPnl).toBeCloseTo(7987, 0);
    expect(database.episodes.listPendingReview()).toHaveLength(1);
    expect(database.workspaceSnapshot().pendingReviewCount).toBe(1);

    const review = database.createTradeReview({
      episodeId: closed.id,
      planId: null,
      symbol: '600519',
      title: '贵州茅台回合复盘',
      direction: 'long',
      planned: false,
      entryPrice: closed.avgEntryPrice ?? 1500,
      exitPrice: closed.avgExitPrice ?? 1580,
      quantity: 100,
      fees: closed.totalFees,
      executionScore: 4,
      summary: '按计划分批退出。',
      lesson: '继续等待确认信号。',
    });

    expect(review.episodeId).toBe(closed.id);
    expect(database.episodes.getEpisode(closed.id).reviewId).toBe(review.id);
    expect(database.workspaceSnapshot().pendingReviewCount).toBe(0);
    database.close();
  });

  it('重复录入相同成交会被拒绝', () => {
    const database = createDatabase();
    const input = {
      symbol: '510300',
      side: 'buy' as const,
      quantity: 1000,
      price: 3.8,
      fees: 1,
      tradeAt: '2026-04-01T09:31:00.000Z',
    };

    database.episodes.addExecution(input);
    expect(() => database.episodes.addExecution(input)).toThrow('该成交已存在');
    database.close();
  });
});
