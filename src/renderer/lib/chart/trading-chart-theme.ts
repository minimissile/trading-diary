import type { DeepPartial, Styles } from 'klinecharts';
import { chartColors } from '../../theme/market-colors';

function readCssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/**
 * 基于应用主题变量生成 klinecharts 样式，保持红涨绿跌与深色画布一致。
 */
export function buildTradingChartStyles(): DeepPartial<Styles> {
  const profit = readCssVar('--td-color-profit', '#ff626f');
  const loss = readCssVar('--td-color-loss', '#42cc8b');
  const flat = readCssVar('--td-color-flat', '#6b7280');
  const line = readCssVar('--td-color-line', '#20394b');
  const ink = readCssVar('--td-color-ink', '#e7f1fa');
  const inkSecondary = readCssVar('--td-color-ink-secondary', '#9fb0c1');
  const inkTertiary = readCssVar('--td-color-ink-tertiary', '#6f8396');
  const surface = readCssVar('--td-color-surface', '#0d2231');
  const lineStrong = readCssVar('--td-color-line-strong', '#2b4d64');

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
      type: 'candle_solid',
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
