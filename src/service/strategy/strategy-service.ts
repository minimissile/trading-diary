import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { PersonalWatchlistItem } from '../../shared/watchlist/personal';
import { DIVIDEND_POOL_SEED, GROWTH_POOL_SEED } from '../../shared/watchlist/pools';
import {
  completedStrategyDate,
  DEFAULT_STOCK_STRATEGY_SETTINGS,
  STOCK_STRATEGY_ASSUMPTIONS,
} from '../../shared/strategy/catalog';
import type {
  StockBacktestInput,
  StockBacktestResult,
  StockScreenResult,
  StockStrategySettings,
  StockStrategyState,
  StrategyExclusion,
  StrategySeries,
  StrategyStock,
} from '../../shared/strategy/types';
import {
  stockStrategyBacktestSchema,
  stockStrategySettingsSchema,
  stockStrategySymbolSchema,
} from '../../shared/schemas/requests/stock-strategy.requests';
import { rankStocks, runStockBacktest } from './strategy-engine';
import { StrategyDataProvider } from './strategy-data';

export class StockStrategyService {
  private state: StockStrategyState;
  private readonly file: string;
  private readonly pending = new Map<string, Promise<StockScreenResult>>();
  private backtestRunning = false;

  constructor(
    dataDir: string,
    private readonly personal: () => PersonalWatchlistItem[],
    private readonly data = new StrategyDataProvider(),
  ) {
    const directory = path.join(dataDir, 'stock-strategy');
    mkdirSync(directory, { recursive: true });
    this.file = path.join(directory, 'state-v1.json');
    this.state = { settings: { ...DEFAULT_STOCK_STRATEGY_SETTINGS }, screens: [], lastBacktest: null };
    try {
      const saved = JSON.parse(readFileSync(this.file, 'utf8')) as StockStrategyState;
      const settings = stockStrategySettingsSchema.parse(saved.settings);
      this.state = {
        settings,
        screens: Array.isArray(saved.screens) ? saved.screens.slice(0, 30) : [],
        lastBacktest: saved.lastBacktest ?? null,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error('策略配置文件无法读取，请检查 stock-strategy/state-v1.json；未覆盖原文件', { cause: error });
    }
  }

  getState(): StockStrategyState {
    return structuredClone(this.state);
  }

  private persist(next: StockStrategyState): void {
    const temporary = `${this.file}.tmp`;
    writeFileSync(temporary, JSON.stringify(next), { mode: 0o600 });
    renameSync(temporary, this.file);
    this.state = next;
  }

  saveSettings(input: StockStrategySettings): StockStrategySettings {
    const settings = stockStrategySettingsSchema.parse(input);
    this.persist({ ...this.state, settings });
    return settings;
  }

  private universe(settings: StockStrategySettings): StrategyStock[] {
    let items: StrategyStock[];
    if (settings.poolId === 'personal') {
      items = this.personal().filter((item) => item.kind === 'stock' && ['SH', 'SZ'].includes(item.venue));
    } else if (settings.poolId === 'custom') items = settings.symbols.map((symbol) => ({ symbol, name: symbol }));
    else items = [...DIVIDEND_POOL_SEED, ...GROWTH_POOL_SEED];
    const unique = [
      ...new Map(
        items
          .filter((item) => stockStrategySymbolSchema.safeParse(item.symbol).success)
          .map(({ symbol, name }) => [symbol, { symbol, name }]),
      ).values(),
    ].sort((a, b) => a.symbol.localeCompare(b.symbol));
    if (!unique.length) throw new Error('股票池没有沪深 A 股，请先添加自选股或填写自定义代码');
    if (unique.length > 60) throw new Error('首版单次最多扫描 60 只股票，请使用自定义股票池缩小范围');
    return unique;
  }

  private async loadUniverse(
    universe: StrategyStock[],
    date: string,
    refresh: boolean,
  ): Promise<{ series: StrategySeries[]; failures: StrategyExclusion[] }> {
    const series: StrategySeries[] = [];
    const failures: StrategyExclusion[] = [];
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(6, universe.length) }, async () => {
        while (cursor < universe.length) {
          const stock = universe[cursor++]!;
          try {
            const loaded = await this.data.load(stock.symbol, date, refresh);
            // A provider name is needed for ST/delisting screening, rather than trusting old seed names.
            if (loaded.name === stock.symbol) throw new Error('缺少证券名称，无法排除 ST / 退市标的');
            series.push(loaded);
          } catch (error) {
            failures.push({ ...stock, reason: error instanceof Error ? error.message : '日线读取失败' });
          }
        }
      }),
    );
    return { series: series.sort((a, b) => a.symbol.localeCompare(b.symbol)), failures };
  }

  screen(input: { settings: StockStrategySettings; refresh?: boolean }): Promise<StockScreenResult> {
    const settings = stockStrategySettingsSchema.parse(input.settings);
    const universe = this.universe(settings);
    const date = completedStrategyDate();
    const key = JSON.stringify({ settings, universe, date });
    const pending = this.pending.get(key);
    if (pending) return pending;
    const run = this.runScreen(settings, universe, date, input.refresh ?? false).finally(() => this.pending.delete(key));
    this.pending.set(key, run);
    return run;
  }

  private async runScreen(
    settings: StockStrategySettings,
    universe: StrategyStock[],
    date: string,
    refresh: boolean,
  ): Promise<StockScreenResult> {
    const benchmark = await this.data.load('000300', date, refresh, true);
    const signalDate = benchmark.bars.at(-1)!.date;
    const cached = this.state.screens.find(
      (item) =>
        item.signalDate === signalDate &&
        JSON.stringify(item.settings) === JSON.stringify(settings) &&
        item.universe.map((stock) => stock.symbol).join() === universe.map((stock) => stock.symbol).join(),
    );
    if (!refresh && cached && Date.now() - Date.parse(cached.createdAt) < 15 * 60_000) return cached;
    const { series, failures } = await this.loadUniverse(universe, date, refresh);
    if (!series.length) throw new Error(`股票池日线全部加载失败：${failures[0]?.reason ?? '暂无数据'}`);
    const exclusions = [...failures];
    const eligible = series.filter((item) => {
      const history = item.bars.filter((bar) => bar.date <= signalDate);
      const reason = /ST|退/iu.test(item.name)
        ? '当前名称含 ST / 退市标识'
        : history.at(-1)?.date !== signalDate
          ? '缺少信号日行情（停牌或数据未更新）'
          : history.length < 61
            ? '不足 61 根日线，无法计算策略'
            : history.at(-1)!.volume <= 0
              ? '当日无成交'
              : null;
      if (reason) exclusions.push({ symbol: item.symbol, name: item.name, reason });
      return reason === null;
    });
    const result: StockScreenResult = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      signalDate,
      settings,
      universe,
      evaluatedCount: eligible.length,
      candidates: rankStocks(eligible, signalDate, settings),
      exclusions,
      warnings: [
        '信号用于下一实际交易日候选；参考价是信号日收盘价，盘中与 15:30 前不纳入当日日线。',
        STOCK_STRATEGY_ASSUMPTIONS[0]!,
        ...(exclusions.length ? [`${exclusions.length} 只股票未参与排名，请查看数据排除明细。`] : []),
        ...(signalDate < date ? [`行情截至 ${signalDate}；可能处于休市或数据尚未更新，请以该日期理解信号。`] : []),
      ],
    };
    this.persist({
      ...this.state,
      screens: [result, ...this.state.screens.filter((item) => item.id !== cached?.id)].slice(0, 30),
    });
    return result;
  }

  async backtest(value: StockBacktestInput): Promise<StockBacktestResult> {
    const input = stockStrategyBacktestSchema.parse(value);
    if (input.endDate > completedStrategyDate()) throw new Error('结束日期不能晚于可用的完整日线日期');
    if (this.backtestRunning) throw new Error('已有回测运行中，请稍后重试');
    this.backtestRunning = true;
    try {
      const universe = this.universe(input.settings);
      const [benchmark, loaded] = await Promise.all([
        this.data.load('000300', input.endDate, false, true),
        this.loadUniverse(universe, input.endDate, false),
      ]);
      if (loaded.failures.length)
        throw new Error(
          `回测中止：${loaded.failures.map((item) => `${item.symbol} ${item.reason}`).join('；')}。请重试或调整股票池，避免遗漏标的改变回测结果。`,
        );
      const incomplete = loaded.series.filter((item) => item.bars.filter((bar) => bar.date < input.startDate).length < 61);
      if (incomplete.length)
        throw new Error(
          `这些股票缺少开始日前 61 根预热日线：${incomplete.map((item) => item.symbol).join('、')}。请缩短区间或调整股票池。`,
        );
      if (loaded.series.some((item) => /ST|退/iu.test(item.name)))
        throw new Error('股票池包含当前 ST / 退市标的，请移除后回测；首版没有历史特殊交易状态数据');
      const result: StockBacktestResult = {
        ...runStockBacktest(loaded.series, benchmark, input),
        id: randomUUID(),
        createdAt: new Date().toISOString(),
      };
      if (input.settings.selectionSource) {
        const source = input.settings.selectionSource;
        result.warnings.unshift(`本次股票池来自 ${source.platform === 'wencai' ? '同花顺 i 问财' : '东方财富妙想'} 于 ${source.queriedAt} 的查询：${source.query}。这是当前名单的固定池回测，包含前视偏差，不能代表该条件的历史选股收益。`);
      }
      this.persist({ ...this.state, lastBacktest: result });
      return result;
    } finally {
      this.backtestRunning = false;
    }
  }
}
