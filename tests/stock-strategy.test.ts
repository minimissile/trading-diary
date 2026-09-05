import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { completedStrategyDate, DEFAULT_STOCK_STRATEGY_SETTINGS } from '../src/shared/strategy/catalog';
import type { StockBacktestInput, StrategySeries } from '../src/shared/strategy/types';
import {
  affordableQuantity,
  evaluateStock,
  rankStocks,
  runStockBacktest,
  strategyFees,
} from '../src/service/strategy/strategy-engine';
import { parseStrategySeries, StrategyDataProvider } from '../src/service/strategy/strategy-data';
import { StockStrategyService } from '../src/service/strategy/strategy-service';
import { serviceRequestSchema } from '../src/shared/service.schemas';

function fixture(symbol = '600036', count = 100): StrategySeries {
  const bars: StrategySeries['bars'] = [];
  const date = new Date('2025-01-02T00:00:00Z');
  for (let index = 0; index < count; index++) {
    while ([0, 6].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() + 1);
    const close = 10 + index * 0.025;
    bars.push({
      date: date.toISOString().slice(0, 10),
      open: close - 0.01,
      high: close + 0.05,
      low: close - 0.05,
      close,
      rawOpen: close - 0.01,
      rawClose: close,
      volume: 1000,
    });
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return { symbol, name: `测试${symbol}`, bars };
}
const settings = { ...DEFAULT_STOCK_STRATEGY_SETTINGS, topN: 1, holdingDays: 3 };
function input(stock: StrategySeries, changes: Partial<StockBacktestInput['settings']> = {}): StockBacktestInput {
  return { settings: { ...settings, ...changes }, startDate: stock.bars[65]!.date, endDate: stock.bars.at(-1)!.date };
}

describe('A-share strategy signals', () => {
  it('excludes intraday bars using Shanghai time and a 15:30 cutoff', () => {
    expect(completedStrategyDate(new Date('2026-09-04T07:29:59Z'))).toBe('2026-09-03');
    expect(completedStrategyDate(new Date('2026-09-04T07:30:00Z'))).toBe('2026-09-04');
    expect(completedStrategyDate(new Date('2026-09-04T23:00:00Z'))).toBe('2026-09-04');
  });
  it('does not let future bars affect earlier rankings', () => {
    const stock = fixture();
    const date = stock.bars[65]!.date;
    const before = evaluateStock(stock, date, settings);
    expect(before).not.toBeNull();
    stock.bars.slice(66).forEach((bar) => {
      bar.close *= 30;
      bar.high *= 40;
      bar.volume *= 100;
    });
    expect(evaluateStock(stock, date, settings)).toEqual(before);
  });
  it('requires warmup, the exact signal date and excludes ST', () => {
    const stock = fixture();
    expect(evaluateStock(stock, stock.bars[59]!.date, settings)).toBeNull();
    expect(evaluateStock(stock, '2026-09-01', settings)).toBeNull();
    expect(evaluateStock({ ...stock, name: '*ST测试' }, stock.bars[70]!.date, settings)).toBeNull();
  });
  it('uses the previous 20 highs for a breakout, excluding today', () => {
    const stock = fixture();
    const bar = stock.bars[70]!;
    bar.close += 0.2;
    bar.high = bar.close + 1;
    bar.rawClose = bar.close;
    bar.volume = 2000;
    const result = evaluateStock(stock, bar.date, { ...settings, strategyId: 'breakout' });
    expect(result?.volumeRatio).toBe(2);
    bar.volume = 1000;
    expect(evaluateStock(stock, bar.date, { ...settings, strategyId: 'breakout' })).toBeNull();
  });
  it('ranks reproducibly and leaves no-signal dates empty', () => {
    const first = fixture('600036'),
      second = fixture('000333');
    expect(rankStocks([first, second], first.bars[70]!.date, settings)[0]?.symbol).toBe('000333');
    expect(rankStocks([first], first.bars[70]!.date, { ...settings, strategyId: 'breakout' })).toEqual([]);
  });
});

describe('A-share event-driven backtest', () => {
  it('buys next session and cannot sell on the entry day; cash and fees reconcile', () => {
    const stock = fixture();
    const report = runStockBacktest([stock], fixture('000300'), input(stock, { holdingDays: 1 }));
    expect(report.trades.length).toBeGreaterThan(2);
    const [buy, sell] = report.trades;
    expect(buy!.signalDate).toBe(stock.bars[64]!.date);
    expect(buy!.date).toBe(stock.bars[65]!.date);
    expect(sell!.date).toBe(stock.bars[66]!.date);
    expect(sell!.signalDate).toBe(buy!.date);
    expect(buy!.quantity % 100).toBe(0);
    expect(sell!.pnl).toBeCloseTo(sell!.amount - sell!.fees - buy!.amount - buy!.fees, 2);
    const flow = report.trades.reduce(
      (cash, trade) => cash + (trade.side === 'sell' ? trade.amount - trade.fees : -trade.amount - trade.fees),
      settings.initialCapital,
    );
    expect(report.curve.at(-1)!.cash).toBeCloseTo(flow, 2);
    expect(report.curve.every((point) => point.cash >= 0)).toBe(true);
    expect(report.fees).toBeCloseTo(
      report.trades.reduce((sum, trade) => sum + trade.fees, 0),
      2,
    );
  });
  it('keeps pending exits across suspended sessions', () => {
    const stock = fixture();
    const missing = stock.bars[66]!.date;
    stock.bars = stock.bars.filter((bar) => bar.date !== missing);
    const report = runStockBacktest([stock], fixture('000300'), input(fixture(), { holdingDays: 1 }));
    expect(report.trades[1]!.side).toBe('sell');
    expect(report.trades[1]!.date).toBe(fixture().bars[67]!.date);
    expect(report.skippedOrders).toBeGreaterThan(0);
    expect(report.warnings.some((warning) => warning.includes('缺失持仓行情'))).toBe(true);
  });
  it('does not buy a limit-up open, even when the closing bar looks attractive', () => {
    const stock = fixture();
    const bar = stock.bars[65]!;
    bar.open = stock.bars[64]!.close * 1.1;
    bar.rawOpen = bar.open;
    const report = runStockBacktest([stock], fixture('000300'), input(stock));
    expect(report.trades.some((trade) => trade.date === bar.date && trade.side === 'buy')).toBe(false);
  });
  it('uses raw prices for affordability and supports STAR minimum size', () => {
    expect(affordableQuantity('600036', 10, 1000, settings)).toBe(0);
    expect(affordableQuantity('600036', 10, 1005, settings)).toBe(100);
    expect(affordableQuantity('688041', 10, 1995, settings)).toBe(0);
    expect(affordableQuantity('688041', 10, 2015, settings)).toBe(201);
    expect(strategyFees(1000, 'buy', settings)).toBe(5);
    expect(strategyFees(1000, 'sell', settings)).toBe(5.5);
  });
  it('adjusted corporate-action returns do not create a fictitious price crash', () => {
    const base = fixture();
    const adjusted = structuredClone(base);
    for (const bar of adjusted.bars.slice(68)) {
      bar.rawOpen /= 2;
      bar.rawClose /= 2;
    }
    const expected = runStockBacktest([base], fixture('000300'), input(base, { holdingDays: 10 }));
    const actual = runStockBacktest([adjusted], fixture('000300'), input(base, { holdingDays: 10 }));
    // First position spans the split: adjusted economic value is unchanged, equivalent share count doubles.
    expect(actual.trades[1]!.amount).toBe(expected.trades[1]!.amount);
    expect(actual.trades[1]!.quantity).toBeCloseTo(expected.trades[1]!.quantity * 2);
  });
  it('reports no-trade returns and undefined win rate honestly', () => {
    const stock = fixture();
    const result = runStockBacktest([stock], fixture('000300'), input(stock, { strategyId: 'breakout' }));
    expect(result.totalReturnPercent).toBe(0);
    expect(result.maxDrawdownPercent).toBe(0);
    expect(result.winRatePercent).toBeNull();
    expect(result.trades).toEqual([]);
  });
});

describe('strategy data and contracts', () => {
  const rows = [['2025-01-02', '10', '11', '12', '9', '1000']];
  it('fails rather than mixing raw and adjusted series', () => {
    expect(() => parseStrategySeries('sh600036', { day: rows }, { day: rows })).toThrow('日线为空');
    expect(() =>
      parseStrategySeries('sh600036', { day: rows }, { qfqday: [['2025-01-03', '10', '11', '12', '9', '1000']] }),
    ).toThrow('不对齐');
    const series = parseStrategySeries('sh600036', { day: rows, qt: { sh600036: ['', '招商银行'] } }, { qfqday: rows });
    expect(series.name).toBe('招商银行');
    expect(series.bars[0]!.rawClose).toBe(11);
  });
  it('validates IPC inputs, dates and bounded workload', () => {
    const base = { id: '00000000-0000-4000-8000-000000000001', method: 'stockStrategy.backtest', params: input(fixture()) };
    expect(serviceRequestSchema.safeParse(base).success).toBe(true);
    expect(serviceRequestSchema.safeParse({ ...base, params: { ...base.params, endDate: '2025-02-30' } }).success).toBe(false);
    expect(
      serviceRequestSchema.safeParse({ ...base, params: { ...base.params, settings: { ...settings, topN: 0 } } }).success,
    ).toBe(false);
    expect(
      serviceRequestSchema.safeParse({
        ...base,
        params: { ...base.params, settings: { ...settings, poolId: 'custom', symbols: ['510300'] } },
      }).success,
    ).toBe(false);
  });
  it('persists configuration separately and reloads it without portfolio writes', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'stock-strategy-test-'));
    try {
      const service = new StockStrategyService(directory, () => []);
      service.saveSettings({ ...settings, topN: 7 });
      expect(new StockStrategyService(directory, () => []).getState().settings.topN).toBe(7);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('aborts a partial-data backtest and does not persist a misleading result', async () => {
    class FailingProvider extends StrategyDataProvider {
      override load(symbol: string): Promise<StrategySeries> {
        if (symbol === '000333') return Promise.reject(new Error('模拟服务故障'));
        return Promise.resolve(fixture(symbol));
      }
    }
    const directory = mkdtempSync(path.join(os.tmpdir(), 'stock-strategy-test-'));
    try {
      const service = new StockStrategyService(directory, () => [], new FailingProvider());
      await expect(service.backtest(input(fixture(), { poolId: 'custom', symbols: ['600036', '000333'] }))).rejects.toThrow(
        '回测中止',
      );
      expect(service.getState().lastBacktest).toBeNull();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
