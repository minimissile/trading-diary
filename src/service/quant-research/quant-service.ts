import { randomUUID } from 'node:crypto';
import { quantCompletedDate } from '../../shared/quant-research/catalog';
import { quantSettingsSchema, quantSymbolSchema } from '../../shared/quant-research/schemas';
import type { QuantRun, QuantSettings, QuantSignal, QuantStock } from '../../shared/quant-research/types';
import type { QuantResearchDatabase } from './quant-database';
import { TencentQuantDataProvider, type QuantDataProvider } from './quant-data';
import { quantWarmup, scanQuantSeries } from './quant-engine';

export class QuantResearchService {
  private pending: { key: string; promise: Promise<QuantRun> } | null = null;

  constructor(
    private readonly database: QuantResearchDatabase,
    private readonly personal: () => QuantStock[],
    private readonly data: QuantDataProvider = new TencentQuantDataProvider(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  getState() {
    return this.database.getState();
  }
  getRun(id: string) {
    return this.database.getRun(id);
  }
  saveSettings(input: QuantSettings) {
    if (this.pending) throw new Error('扫描正在进行，请完成后再保存配置');
    return this.database.saveSettings(input);
  }

  scan(input: QuantSettings): Promise<QuantRun> {
    const settings = quantSettingsSchema.parse(input);
    const pool = settings.poolId === 'personal' ? this.personal() : settings.symbols.map((symbol) => ({ symbol, name: symbol }));
    const universe = [
      ...new Map(
        pool.filter((item) => quantSymbolSchema.safeParse(item.symbol).success).map((item) => [item.symbol, item]),
      ).values(),
    ].sort((a, b) => a.symbol.localeCompare(b.symbol));
    if (!universe.length) throw new Error('股票池中没有沪深 A 股，请添加自选股或填写自定义股票代码');
    if (universe.length > 60) throw new Error('单次最多扫描 60 只股票，请使用自定义股票池缩小范围');
    const key = JSON.stringify({ settings, universe });
    if (this.pending) {
      if (this.pending.key === key) return this.pending.promise;
      throw new Error('已有扫描正在进行，请稍后再试');
    }
    const promise = this.run(settings, universe).finally(() => {
      this.pending = null;
    });
    this.pending = { key, promise };
    return promise;
  }

  private async run(settings: QuantSettings, universe: QuantStock[]): Promise<QuantRun> {
    const cutoff = quantCompletedDate(this.now());
    const calendar = await this.data.load('000300', cutoff, true);
    const dates = calendar.bars
      .filter((bar) => bar.date <= cutoff && bar.volume > 0)
      .slice(-settings.recentDays)
      .map((bar) => bar.date);
    if (dates.length < settings.recentDays) throw new Error('交易日历不足，无法确定完整扫描窗口');
    // A stale provider must not silently make an old trading day look current. Weekends and short holidays are allowed.
    if (Date.parse(cutoff) - Date.parse(dates.at(-1)!) > 15 * 86_400_000) throw new Error('交易日历超过 15 天未更新，请稍后重试');
    const signals: QuantSignal[] = [];
    const exclusions: QuantRun['exclusions'] = [];
    let cursor = 0;
    let scannedCount = 0;
    await Promise.all(
      Array.from({ length: Math.min(6, universe.length) }, async () => {
        while (cursor < universe.length) {
          const stock = universe[cursor++]!;
          try {
            const series = await this.data.load(stock.symbol, cutoff);
            stock.name = series.name;
            if (/ST|退/iu.test(series.name)) throw new Error('当前名称含 ST / 退，已排除');
            const indexes = new Map(series.bars.map((bar, index) => [bar.date, index]));
            if (dates.some((date) => !indexes.has(date) || series.bars[indexes.get(date)!]!.volume <= 0))
              throw new Error('扫描窗口存在缺失日线或停牌，未计入完整扫描');
            if (indexes.get(dates[0]!)! < quantWarmup(settings))
              throw new Error(`历史不足，需要信号窗口之前至少 ${quantWarmup(settings)} 根日线`);
            signals.push(...scanQuantSeries(series, dates, settings));
            scannedCount++;
          } catch (error) {
            exclusions.push({ ...stock, reason: (error instanceof Error ? error.message : '日线读取失败').slice(0, 2000) });
          }
        }
      }),
    );
    if (!scannedCount) throw new Error(`没有可完成扫描的股票：${exclusions[0]?.reason ?? '数据不可用'}`);
    signals.sort((a, b) => b.date.localeCompare(a.date) || a.symbol.localeCompare(b.symbol) || a.ruleId.localeCompare(b.ruleId));
    const result: QuantRun = {
      id: randomUUID(),
      createdAt: this.now().toISOString(),
      startDate: dates[0]!,
      endDate: dates.at(-1)!,
      settings,
      universe,
      signals,
      exclusions: exclusions.sort((a, b) => a.symbol.localeCompare(b.symbol)),
      scannedCount,
      matchedCount: new Set(signals.map((signal) => signal.symbol)).size,
      signalCount: signals.length,
      excludedCount: exclusions.length,
      source: 'tencent',
      engineVersion: 1,
    };
    this.database.saveRun(result);
    return result;
  }
}
