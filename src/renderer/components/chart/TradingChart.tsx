import { useEffect, useRef } from 'react';
import { dispose, init, type Chart } from 'klinecharts';
import type { KLineAdjust, KLinePeriod } from '../../../shared/market/types';
import { buildTradingChartStyles } from '../../lib/chart/trading-chart-theme';
import { toChartPeriod } from '../../lib/chart/period-map';

export interface TradingChartProps {
  symbol: string;
  name?: string;
  period: KLinePeriod;
  adjust: KLineAdjust;
  mainIndicators?: string[];
  subIndicators?: string[];
  height?: number | string;
}

/**
 * 交易 K 线图组件，封装 klinecharts 生命周期与主题配置。
 */
export function TradingChart({
  symbol,
  name,
  period,
  adjust,
  mainIndicators = ['MA'],
  subIndicators = ['VOL', 'MACD'],
  height = 560,
}: TradingChartProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = init(container, { styles: buildTradingChartStyles() });
    if (!chart) return;

    chartRef.current = chart;
    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      dispose(container);
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    chart.setStyles(buildTradingChartStyles());
    chart.setSymbol({
      ticker: name ? `${name} (${symbol})` : symbol,
      pricePrecision: 2,
      volumePrecision: 0,
    });
    chart.setPeriod(toChartPeriod(period));
    chart.setDataLoader({
      getBars: ({ type, callback }) => {
        if (type !== 'init') {
          callback([], false);
          return;
        }

        void window.desktop.market.listKlines(symbol, period, adjust, 320).then(
          (result) => callback(result.bars, false),
          () => callback([], false),
        );
      },
    });
  }, [symbol, name, period, adjust]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    chart.removeIndicator();
    for (const indicator of mainIndicators) {
      chart.createIndicator(indicator, true);
    }
    for (const indicator of subIndicators) {
      chart.createIndicator(indicator, false);
    }
  }, [mainIndicators, subIndicators, symbol, period, adjust]);

  return <div className="trading-chart-host" style={{ height }} ref={containerRef} />;
}
