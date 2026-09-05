import type { ResearchInput, ResearchReport } from '../../shared/quant-research/workbench';
import type { QuantBar, QuantSeries } from '../../shared/quant-research/types';

export type ReportBody = Pick<
  ResearchReport,
  'asOf' | 'title' | 'source' | 'notes' | 'warnings' | 'metrics' | 'columns' | 'rows' | 'curve'
>;
const pct = (n: number) => `${n.toFixed(2)}%`;
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

function usable(series: QuantSeries, endDate: string, required: number): QuantBar[] {
  const bars = series.bars.filter((b) => b.date <= endDate);
  if (bars.length < required) throw new Error(`历史日线不足：需要 ${required} 根，实际 ${bars.length} 根`);
  if (/ST|退/i.test(series.name)) throw new Error('基础研究暂不模拟 ST 或退市证券');
  if (Date.parse(endDate) - Date.parse(bars.at(-1)!.date) > 15 * 864e5)
    throw new Error('日线滞后超过 15 天，请调整截止日期或稍后重试');
  return bars;
}

export function simulateBacktest(input: ResearchInput<'backtest'>, series: QuantSeries): ReportBody {
  const bars = usable(series, input.endDate, input.days + input.period + 1);
  const start = bars.length - input.days;
  const curve: NonNullable<ResearchReport['curve']> = [];
  const rows: ResearchReport['rows'] = [];
  let cash = input.capital,
    units = 0,
    peak = input.capital,
    maxDrawdown = 0,
    fees = 0;
  let buyCost = 0,
    closed = 0,
    wins = 0,
    exposure = 0,
    skipped = 0;
  const fee = (amount: number) => Math.max(input.minCommission, (amount * input.commissionBps) / 10000);
  const firstOpen = bars[start]!.open;
  curve.push({ date: bars[start - 1]!.date, equity: input.capital, benchmark: input.capital });
  for (let i = start; i < bars.length; i++) {
    const bar = bars[i]!,
      signal = bars[i - 1]!;
    // Only data available at the previous close may generate today's open order.
    const window = bars.slice(i - input.period, i);
    const average = mean(window.map((b) => b.close));
    const priorHigh = Math.max(...bars.slice(i - input.period - 1, i - 1).map((b) => b.high));
    const wantsBuy = input.strategy === 'ma' ? signal.close > average : signal.close > priorHigh;
    const wantsSell = signal.close < average;
    const direction = !units && wantsBuy ? 'buy' : units && wantsSell ? 'sell' : null;
    if (direction && (bar.volume <= 0 || bar.high === bar.low)) {
      skipped++;
    } else if (direction === 'buy') {
      const execution = bar.open * (1 + input.slippageBps / 10000);
      const amount = Math.min(cash / (1 + input.commissionBps / 10000), cash - input.minCommission);
      if (amount > 0) {
        const cost = fee(amount);
        units = amount / execution;
        buyCost = amount + cost;
        cash = Math.max(0, cash - buyCost);
        fees += cost;
        rows.push({
          date: bar.date,
          signalDate: signal.date,
          side: '买入',
          price: execution,
          units,
          fee: cost,
          profit: null,
          reason: input.strategy === 'ma' ? '收盘站上均线' : '收盘突破前期最高价',
        });
      }
    } else if (direction === 'sell') {
      const execution = bar.open * (1 - input.slippageBps / 10000);
      const amount = units * execution;
      const cost = Math.min(amount, fee(amount) + (amount * input.sellTaxBps) / 10000);
      const profit = amount - cost - buyCost;
      cash += amount - cost;
      fees += cost;
      closed++;
      if (profit > 0) wins++;
      rows.push({
        date: bar.date,
        signalDate: signal.date,
        side: '卖出',
        price: execution,
        units,
        fee: cost,
        profit,
        reason: '收盘跌破均线',
      });
      units = 0;
    }
    if (units > 0) exposure++;
    const equity = cash + units * bar.close;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, (peak - equity) / peak);
    curve.push({ date: bar.date, equity, benchmark: (input.capital * bar.close) / firstOpen });
  }
  const last = curve.at(-1)!;
  return {
    asOf: bars.at(-1)!.date,
    title: `${series.name} · ${input.strategy === 'ma' ? '均线' : '突破'} ${input.period} 日回测`,
    source: '腾讯前复权日线 · 独立研究引擎 v1',
    metrics: [
      { label: '策略收益', value: pct((last.equity / input.capital - 1) * 100) },
      { label: '买入持有收益', value: pct((last.benchmark / input.capital - 1) * 100) },
      { label: '最大回撤', value: pct(maxDrawdown * 100) },
      { label: '期末资产', value: last.equity.toFixed(2) },
      { label: '完整交易 / 胜率', value: `${closed} / ${closed ? pct((wins / closed) * 100) : '—'}` },
      { label: '费用合计', value: fees.toFixed(2) },
      { label: '持仓天数', value: `${exposure} / ${input.days}` },
      { label: '期末持仓', value: units ? '持有，按收盘估值' : '空仓' },
    ],
    columns: [
      { key: 'date', label: '模拟成交日' },
      { key: 'signalDate', label: '信号日' },
      { key: 'side', label: '方向' },
      { key: 'price', label: '复权成交价', format: 'number' },
      { key: 'units', label: '模拟单位', format: 'number' },
      { key: 'fee', label: '费用', format: 'money' },
      { key: 'profit', label: '平仓净盈亏', format: 'money' },
      { key: 'reason', label: '依据' },
    ],
    rows,
    curve,
    warnings: skipped ? [`${skipped} 个信号因零成交量或一字 K 线跳过，后续按新的收盘信号重新判断。`] : [],
    notes: [
      '前一日收盘产生信号，下一根日线开盘模拟成交；只做多，同日不反向成交。',
      '采用前复权价格与可分割模拟单位，不模拟真实整手、涨跌停队列、分红税或公司行动现金流；用于策略比较。',
      '佣金、最低佣金、卖出附加费与滑点使用本次输入参数，均非自动读取的历史费率。买入持有基线从首日开盘计价、不扣费。',
      `区间 ${bars[start]!.date} 至 ${last.date}，共 ${input.days} 个日线样本；期末不强制平仓，未实现收益计入净值。`,
    ],
  };
}

function features(bars: QuantBar[], i: number): number[] {
  const bar = bars[i]!;
  return [
    bar.close > bars[i - 1]!.close,
    bar.close > mean(bars.slice(i - 4, i + 1).map((b) => b.close)),
    bar.close > mean(bars.slice(i - 19, i + 1).map((b) => b.close)),
    bar.volume > mean(bars.slice(i - 20, i).map((b) => b.volume)),
    bar.close > bars[i - 5]!.close,
  ].map(Number);
}

export function simulatePrediction(input: ResearchInput<'prediction'>, series: QuantSeries): ReportBody {
  const bars = usable(series, input.endDate, input.trainingDays + input.testDays + 21);
  const rows: ResearchReport['rows'] = [];
  let correct = 0,
    up = 0,
    latest = 0;
  const start = bars.length - input.testDays - 1;
  for (let t = start; t < bars.length; t++) {
    const counts = [0, 0],
      sums = [Array<number>(5).fill(0), Array<number>(5).fill(0)];
    // The newest training label ends at t, never at t+1.
    for (let i = t - input.trainingDays; i < t; i++) {
      const label = Number(bars[i + 1]!.close > bars[i]!.close);
      counts[label] = counts[label]! + 1;
      features(bars, i).forEach((v, j) => {
        sums[label]![j] = sums[label]![j]! + v;
      });
    }
    const x = features(bars, t);
    const scores = [0, 1].map(
      (label) =>
        Math.log((counts[label]! + 1) / (input.trainingDays + 2)) +
        x.reduce((total, v, j) => {
          const p = (sums[label]![j]! + 1) / (counts[label]! + 2);
          return total + Math.log(v ? p : 1 - p);
        }, 0),
    );
    latest = 1 / (1 + Math.exp(scores[0]! - scores[1]!));
    const next = bars[t + 1];
    const actual = next ? Number(next.close > bars[t]!.close) : null;
    const forecast = Number(latest >= 0.5);
    if (actual !== null) {
      correct += Number(forecast === actual);
      up += actual;
    }
    rows.push({
      date: bars[t]!.date,
      target: next?.date ?? '下一交易日（待观察）',
      probability: latest * 100,
      forecast: forecast ? '上涨' : '非上涨',
      actual: actual === null ? '待观察' : actual ? '上涨' : '非上涨',
      correct: actual === null ? null : forecast === actual,
      trainEnd: bars[t]!.date,
    });
  }
  return {
    asOf: bars.at(-1)!.date,
    title: `${series.name} · 滚动贝叶斯实验`,
    source: '腾讯前复权日线 · Bernoulli Naive Bayes / Laplace 平滑',
    metrics: [
      { label: '样本外方向准确率', value: pct((correct / input.testDays) * 100) },
      { label: '始终看涨基线', value: pct((up / input.testDays) * 100) },
      { label: '最新模型上涨概率', value: pct(latest * 100) },
      { label: '训练 / 检验样本', value: `${input.trainingDays} / ${input.testDays}` },
    ],
    columns: [
      { key: 'date', label: '预测生成日' },
      { key: 'target', label: '目标交易日' },
      { key: 'probability', label: '模型上涨概率', format: 'percent' },
      { key: 'forecast', label: '预测' },
      { key: 'actual', label: '实际' },
      { key: 'correct', label: '命中' },
      { key: 'trainEnd', label: '训练标签截至' },
    ],
    rows: rows.reverse(),
    warnings: [],
    notes: [
      '五个二值特征：当日涨跌、收盘相对 MA5 / MA20、相对前 20 日均量、5 日动量。每次只用当日收盘已知的样本训练。',
      '涨幅大于 0 记为上涨，平盘计入非上涨。滚动训练窗口固定，不随机打散时间序列。',
      '模型概率未经校准，准确率不代表策略收益；未计费用，也不自动生成交易。最新一条尚无真实结果，不计入检验准确率。',
    ],
  };
}
