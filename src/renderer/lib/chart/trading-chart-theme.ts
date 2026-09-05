import type { DeepPartial, Styles } from 'klinecharts';
import type { InstrumentKind } from '../../../shared/market/types';
import { chartColors } from '../../theme/market-colors';

function readCssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/**
 * 基于应用主题变量生成 klinecharts 样式，保持红涨绿跌与深色画布一致。
 * @param kind 标的类型，场外基金使用面积图展示净值
 */
export function buildTradingChartStyles(kind: InstrumentKind = 'stock'): DeepPartial<Styles> {
  const profit = readCssVar('--td-color-profit', '#ff5e73');
  const loss = readCssVar('--td-color-loss', '#39d3c3');
  const flat = readCssVar('--td-color-flat', '#65739a');
  const line = readCssVar('--td-color-line', 'rgb(210 224 255 / 14%)');
  const ink = readCssVar('--td-color-ink', '#f5f7ff');
  const inkSecondary = readCssVar('--td-color-ink-secondary', '#96a2c3');
  const inkTertiary = readCssVar('--td-color-ink-tertiary', '#65739a');
  const surface = readCssVar('--td-color-surface', '#0d1938');
  const lineStrong = readCssVar('--td-color-line-strong', 'rgb(210 224 255 / 24%)');

  return {
    grid: {
      show: true,
      horizontal: {
        show: true,
        color: line,
        style: 'dashed',
        dashedValue: [3, 3],
      },
      vertical: {
        show: true,
        color: line,
        style: 'dashed',
        dashedValue: [3, 3],
      },
    },
    candle: {
      type: kind === 'otc_fund' ? 'area' : 'candle_solid',
      bar: {
        upColor: profit,
        downColor: loss,
        noChangeColor: flat,
        upBorderColor: profit,
        downBorderColor: loss,
        noChangeBorderColor: flat,
        upWickColor: profit,
        downWickColor: loss,
        noChangeWickColor: flat,
      },
      priceMark: {
        show: true,
        high: { color: inkTertiary },
        low: { color: inkTertiary },
        last: {
          upColor: profit,
          downColor: loss,
          noChangeColor: flat,
          text: {
            color: ink,
          },
        },
      },
      tooltip: {
        showRule: 'follow_cross',
        rect: {
          color: surface,
          borderColor: lineStrong,
        },
        title: {
          color: inkSecondary,
        },
        legend: {
          color: inkSecondary,
        },
      },
    },
    indicator: {
      ohlc: {
        upColor: `${profit}B3`,
        downColor: `${loss}B3`,
        noChangeColor: flat,
      },
      bars: [
        {
          upColor: `${profit}99`,
          downColor: `${loss}99`,
          noChangeColor: flat,
        },
      ],
      lines: chartColors.map((color) => ({
        color,
        size: 1,
      })),
      tooltip: {
        title: { color: inkSecondary },
        legend: { color: inkSecondary },
      },
    },
    xAxis: {
      axisLine: { color: line },
      tickLine: { color: line },
      tickText: { color: inkSecondary },
    },
    yAxis: {
      axisLine: { color: line },
      tickLine: { color: line },
      tickText: { color: inkSecondary },
    },
    separator: {
      color: line,
    },
    crosshair: {
      show: true,
      horizontal: {
        line: {
          color: inkTertiary,
          style: 'dashed',
          dashedValue: [4, 2],
        },
        text: {
          color: ink,
          backgroundColor: lineStrong,
          borderColor: lineStrong,
        },
      },
      vertical: {
        line: {
          color: inkTertiary,
          style: 'dashed',
          dashedValue: [4, 2],
        },
        text: {
          color: ink,
          backgroundColor: lineStrong,
          borderColor: lineStrong,
        },
      },
    },
  };
}

/** 按标的类型返回价格小数位。 */
export function pricePrecisionForKind(kind: InstrumentKind): number {
  return kind === 'otc_fund' ? 4 : 2;
}
