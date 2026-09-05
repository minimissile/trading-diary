import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { dispose, init, type Chart } from 'klinecharts';
import type { ChartTradeMarker } from '../../../shared/chart/trade-markers';
import type { InstrumentKind, KLineAdjust, KLinePeriod } from '../../../shared/market/types';
import { applyTradeMarkersToChart } from '../../lib/chart/apply-trade-markers';
import { buildTradingChartStyles, pricePrecisionForKind } from '../../lib/chart/trading-chart-theme';
import { toChartPeriod } from '../../lib/chart/period-map';

export interface TradingChartProps {
  symbol: string;
  name?: string;
  kind?: InstrumentKind;
  period: KLinePeriod;
  adjust: KLineAdjust;
  mainIndicators?: string[];
  subIndicators?: string[];
  tradeMarkers?: ChartTradeMarker[];
  showTradeMarkers?: boolean;
  onLoadError?: (message: string) => void;
}

interface ChartLoadContext {
  symbol: string;
  name?: string;
  kind: InstrumentKind;
  period: KLinePeriod;
  adjust: KLineAdjust;
  mainIndicators: string[];
  subIndicators: string[];
}

const CHART_LAYOUT = {
  pane: {
    height: 72,
    minHeight: 36,
  },
} as const;

const CHART_BAR_LIMIT = 240;

function applyIndicators(chart: Chart, mainIndicators: string[], subIndicators: string[]): void {
  chart.removeIndicator();
  for (const indicator of mainIndicators) {
    chart.createIndicator(indicator, true);
  }
  for (const indicator of subIndicators) {
    chart.createIndicator(indicator, false);
  }
}

function scheduleChartResize(chart: Chart): void {
  requestAnimationFrame(() => {
    chart.resize();
    requestAnimationFrame(() => chart.resize());
  });
}

function ensureContainerHeight(container: HTMLElement): void {
  if (container.clientHeight >= 120) return;
  container.style.height = '480px';
}

function syncSymbolAndPeriod(chart: Chart, ctx: ChartLoadContext): void {
  chart.setStyles(buildTradingChartStyles(ctx.kind));
  chart.setSymbol({
    ticker: ctx.name ? `${ctx.name} (${ctx.symbol})` : ctx.symbol,
    pricePrecision: pricePrecisionForKind(ctx.kind),
    volumePrecision: 0,
  });
  chart.setPeriod(toChartPeriod(ctx.kind === 'otc_fund' ? '1d' : ctx.period));
}

/**
 * 交易 K 线图组件，封装 klinecharts 生命周期与主题配置。
 */
export function TradingChart({
  symbol,
  name,
  kind = 'stock',
  period,
  adjust,
  mainIndicators = ['MA'],
  subIndicators = ['VOL', 'MACD'],
  tradeMarkers = [],
  showTradeMarkers = true,
  onLoadError,
}: TradingChartProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(false);
  const loadContextRef = useRef<ChartLoadContext>({
    symbol,
    name,
    kind,
    period,
    adjust,
    mainIndicators,
    subIndicators,
  });
  const tradeMarkersRef = useRef(tradeMarkers);
  const showTradeMarkersRef = useRef(showTradeMarkers);
  const onLoadErrorRef = useRef(onLoadError);

  useLayoutEffect(() => {
    loadContextRef.current = {
      symbol,
      name,
      kind,
      period,
      adjust,
      mainIndicators,
      subIndicators,
    };
    tradeMarkersRef.current = tradeMarkers;
    showTradeMarkersRef.current = showTradeMarkers;
    onLoadErrorRef.current = onLoadError;
  }, [symbol, name, kind, period, adjust, mainIndicators, subIndicators, tradeMarkers, showTradeMarkers, onLoadError]);

  const refreshTradeMarkers = useCallback((chart: Chart): void => {
    if (chart.getDataList().length === 0) return;
    applyTradeMarkersToChart(chart, tradeMarkersRef.current, { visible: showTradeMarkersRef.current });
  }, []);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    mountedRef.current = true;
    ensureContainerHeight(container);

    const chart = init(container, {
      styles: buildTradingChartStyles(loadContextRef.current.kind),
      layout: CHART_LAYOUT,
    });
    if (!chart) return;

    chartRef.current = chart;

    syncSymbolAndPeriod(chart, loadContextRef.current);

    chart.setDataLoader({
      getBars: ({ type, timestamp, callback }) => {
        if (type === 'backward') {
          callback([], false);
          return;
        }

        const currentRequestId = ++requestIdRef.current;
        const ctx = loadContextRef.current;
        const beforeTimestamp = type === 'forward' && timestamp ? timestamp : undefined;

        void window.desktop.market
          .listKlines(ctx.symbol, ctx.kind === 'otc_fund' ? '1d' : ctx.period, ctx.adjust, CHART_BAR_LIMIT, beforeTimestamp)
          .then(
            (result) => {
              if (!mountedRef.current || currentRequestId !== requestIdRef.current) return;

              callback(result.bars, { forward: result.hasMoreHistory, backward: false });
              requestAnimationFrame(() => {
                if (!mountedRef.current || chartRef.current !== chart) return;
                if (type === 'init') {
                  applyIndicators(chart, ctx.mainIndicators, ctx.subIndicators);
                }
                refreshTradeMarkers(chart);
                scheduleChartResize(chart);
              });
            },
            (reason) => {
              if (!mountedRef.current || currentRequestId !== requestIdRef.current) return;

              callback([], false);
              if (type === 'init') {
                const message = reason instanceof Error ? reason.message : 'K 线加载失败';
                onLoadErrorRef.current?.(message);
              }
            },
          );
      },
    });

    const resizeObserver = new ResizeObserver(() => {
      ensureContainerHeight(container);
      chart.resize();
    });
    resizeObserver.observe(container);
    scheduleChartResize(chart);

    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      resizeObserver.disconnect();
      dispose(container);
      chartRef.current = null;
    };
  }, [refreshTradeMarkers]);

  useEffect(() => {
    const chart = chartRef.current;
    const container = containerRef.current;
    if (!chart || !container) return;

    requestIdRef.current += 1;
    ensureContainerHeight(container);
    syncSymbolAndPeriod(chart, loadContextRef.current);
    scheduleChartResize(chart);
  }, [symbol, kind, period, adjust]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || chart.getDataList().length === 0) return;

    applyIndicators(chart, mainIndicators, subIndicators);
    scheduleChartResize(chart);
  }, [mainIndicators, subIndicators, symbol, period, adjust]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    refreshTradeMarkers(chart);
  }, [tradeMarkers, showTradeMarkers, refreshTradeMarkers]);

  return <div className="trading-chart-host" ref={containerRef} />;
}
