import { QUANT_RULES } from '../../shared/quant-research/catalog';
import type { QuantRuleId, QuantSeries, QuantSettings, QuantSignal } from '../../shared/quant-research/types';

const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

export function quantWarmup(settings: QuantSettings): number {
  return Math.max(
    1,
    settings.rules.some((rule) => rule === 'new_high' || rule === 'new_low') ? settings.lookback : 0,
    settings.rules.some((rule) => rule === 'ma_cross_up' || rule === 'ma_cross_down') ? settings.maPeriod : 0,
    settings.rules.includes('volume_surge') ? 20 : 0,
  );
}

/** Ascending, validated, adjusted OHLCV. Only observations at or before each signal day enter the calculation. */
export function scanQuantSeries(series: QuantSeries, dates: readonly string[], settings: QuantSettings): QuantSignal[] {
  const wanted = new Set(dates);
  const rules = new Set(settings.rules);
  const warmup = quantWarmup(settings);
  const output: QuantSignal[] = [];
  for (let index = warmup; index < series.bars.length; index++) {
    const current = series.bars[index]!;
    const previous = series.bars[index - 1]!;
    if (!wanted.has(current.date) || current.volume <= 0 || previous.volume <= 0) continue;
    const prior = series.bars.slice(Math.max(0, index - 20), index);
    const averageVolume = prior.length === 20 ? mean(prior.map((bar) => bar.volume)) : 0;
    const volumeRatio = averageVolume > 0 ? current.volume / averageVolume : null;
    const add = (ruleId: QuantRuleId, description: string): void => {
      if (!rules.has(ruleId)) return;
      const rule = QUANT_RULES.find((item) => item.id === ruleId)!;
      output.push({
        id: `${series.symbol}:${current.date}:${ruleId}`,
        symbol: series.symbol,
        name: series.name,
        date: current.date,
        ruleId,
        direction: rule.direction,
        adjustedClose: current.close,
        volumeRatio,
        description,
      });
    };
    if (rules.has('new_high') || rules.has('new_low')) {
      const window = series.bars.slice(index - settings.lookback, index);
      const high = Math.max(...window.map((bar) => bar.high));
      const low = Math.min(...window.map((bar) => bar.low));
      if (current.close > high)
        add('new_high', `收盘 ${current.close.toFixed(3)} > 前 ${settings.lookback} 日最高 ${high.toFixed(3)}`);
      if (current.close < low)
        add('new_low', `收盘 ${current.close.toFixed(3)} < 前 ${settings.lookback} 日最低 ${low.toFixed(3)}`);
    }
    if (rules.has('ma_cross_up') || rules.has('ma_cross_down')) {
      const before = mean(series.bars.slice(index - settings.maPeriod, index).map((bar) => bar.close));
      const today = mean(series.bars.slice(index - settings.maPeriod + 1, index + 1).map((bar) => bar.close));
      if (previous.close <= before && current.close > today)
        add('ma_cross_up', `收盘上穿 ${settings.maPeriod} 日均线 ${today.toFixed(3)}`);
      if (previous.close >= before && current.close < today)
        add('ma_cross_down', `收盘下穿 ${settings.maPeriod} 日均线 ${today.toFixed(3)}`);
    }
    if (volumeRatio !== null && volumeRatio >= settings.volumeMultiple) {
      add('volume_surge', `成交量为前 20 日均量的 ${volumeRatio.toFixed(2)} 倍（阈值 ${settings.volumeMultiple}）`);
    }
    if (
      previous.close < previous.open &&
      current.close > current.open &&
      current.open <= previous.close &&
      current.close >= previous.open &&
      (current.open < previous.close || current.close > previous.open)
    ) {
      add('bullish_engulfing', '阳线实体覆盖前一日阴线实体');
    }
    if (
      previous.close > previous.open &&
      current.close < current.open &&
      current.open >= previous.close &&
      current.close <= previous.open &&
      (current.open > previous.close || current.close < previous.open)
    ) {
      add('bearish_engulfing', '阴线实体覆盖前一日阳线实体');
    }
    const range = current.high - current.low;
    const body = Math.abs(current.close - current.open);
    const upper = current.high - Math.max(current.open, current.close);
    if (range > 0 && body >= range * 0.05 && upper >= body * 2 && upper >= range * 0.6) {
      add('upper_shadow', `上影占振幅 ${((upper / range) * 100).toFixed(1)}%，为实体的 ${(upper / body).toFixed(1)} 倍`);
    }
  }
  return output;
}
