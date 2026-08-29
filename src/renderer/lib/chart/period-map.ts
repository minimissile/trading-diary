import type { Period } from 'klinecharts';
import type { KLinePeriod } from '../../../shared/market/types';

/**
 * 将业务层 K 线周期映射为 klinecharts 周期对象。
 * @param period 业务周期
 */
export function toChartPeriod(period: KLinePeriod): Period {
  switch (period) {
    case '1m':
      return { type: 'minute', span: 1 };
    case '5m':
      return { type: 'minute', span: 5 };
    case '15m':
      return { type: 'minute', span: 15 };
    case '30m':
      return { type: 'minute', span: 30 };
    case '60m':
      return { type: 'hour', span: 1 };
    case '1d':
      return { type: 'day', span: 1 };
    case '1w':
      return { type: 'week', span: 1 };
    case '1M':
      return { type: 'month', span: 1 };
  }
}

export const fundChartPeriodOptions: Array<{ label: string; value: KLinePeriod }> = [
  { label: '日净值', value: '1d' },
];

/** 测试页可选周期列表。 */
export const chartPeriodOptions: Array<{ label: string; value: KLinePeriod }> = [
  { label: '日 K', value: '1d' },
  { label: '周 K', value: '1w' },
  { label: '月 K', value: '1M' },
  { label: '60 分', value: '60m' },
  { label: '15 分', value: '15m' },
  { label: '5 分', value: '5m' },
];

/** 主图叠加指标选项。 */
export const chartMainIndicatorOptions = ['MA', 'EMA', 'BOLL'] as const;

/** 副图指标选项。 */
export const chartSubIndicatorOptions = ['VOL', 'MACD', 'KDJ', 'RSI'] as const;

export type ChartMainIndicator = (typeof chartMainIndicatorOptions)[number];
export type ChartSubIndicator = (typeof chartSubIndicatorOptions)[number];
