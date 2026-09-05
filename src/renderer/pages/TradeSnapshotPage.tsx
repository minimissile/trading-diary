import { useEffect, useRef, useState } from 'react';
import { init, dispose } from 'klinecharts';
import type { TradeSnapshotPayload } from '../../shared/chart/trade-snapshot';
import { applyTradeMarkersToChart } from '../lib/chart/apply-trade-markers';
import { buildTradingChartStyles, pricePrecisionForKind } from '../lib/chart/trading-chart-theme';
import '../styles/trade-snapshot.css';

const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

function SnapshotChart({ payload }: { payload: TradeSnapshotPayload }): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false;
    let captured = false;
    const { trade, bars, markers } = payload;
    const chart = init(element, { styles: buildTradingChartStyles(trade.kind) });
    const fail = (reason: unknown): void => {
      if (!disposed) void window.desktop.tradeSnapshot.ready(reason instanceof Error ? reason.message : '图表加载失败');
    };
    if (!chart) { fail(new Error('无法初始化 K 线图')); return; }
    chart.setSymbol({ ticker: trade.symbol, name: trade.name, pricePrecision: pricePrecisionForKind(trade.kind), volumePrecision: 0 });
    chart.setPeriod({ type: 'day', span: 1 });
    chart.setDataLoader({
      getBars: ({ type, callback }) => {
        if (type !== 'init') { callback([], false); return; }
        callback(bars, false);
        if (captured) return;
        captured = true;
        void (async () => {
          await document.fonts.ready;
          await nextFrame();
          if (disposed) return;
          if (!chart.getDataList().length) throw new Error('图表没有可绘制的行情');
          chart.createIndicator('MA', true, { id: 'candle_pane' });
          chart.createIndicator('VOL', false, { height: 120 });
          applyTradeMarkersToChart(chart, markers, { visible: true });
          chart.resize();
          await nextFrame();
          await nextFrame();
          if (!disposed) await window.desktop.tradeSnapshot.ready();
        })().catch(fail);
      },
    });
    return () => { disposed = true; dispose(element); };
  }, [payload]);
  return <div className="trade-snapshot-chart" ref={host} />;
}

export function TradeSnapshotPage(): React.JSX.Element {
  const [payload, setPayload] = useState<TradeSnapshotPayload | null>(null);
  useEffect(() => {
    let active = true;
    void window.desktop.tradeSnapshot.payload().then((result) => {
      if (active) setPayload(result);
    }).catch((reason: unknown) => {
      if (active) void window.desktop.tradeSnapshot.ready(reason instanceof Error ? reason.message : '行情加载失败');
    });
    return () => { active = false; };
  }, []);
  if (!payload) return <div className="trade-snapshot-page">正在加载行情与历史买卖点…</div>;
  const { trade } = payload;
  return (
    <div className="trade-snapshot-page">
      <div className="trade-snapshot-heading">
        <div><h1>{trade.name} <small>{trade.venue} · {trade.symbol}</small></h1><p>交易 K 线快照 · 日线 · 不复权{trade.kind === 'otc_fund' ? ' · 场外基金净值走势' : ''}</p></div>
        <strong className={trade.side === 'buy' ? 'td-value--profit' : 'td-value--loss'}>{trade.side === 'buy' ? '买入' : '卖出'} · {trade.quantity} × {trade.price}</strong>
      </div>
      <div className="trade-snapshot-meta">成交时间：{new Date(trade.tradeAt).toLocaleString('zh-CN')}　手续费：{trade.fees}　账户：{trade.accountId}</div>
      <SnapshotChart payload={payload} />
      <div className="trade-snapshot-caption">B 买入 · S 卖出 · 金色“本买 / 本卖”为本次交易（尚未保存）　｜　行情截至交易日；当日未收盘数据可能变化</div>
    </div>
  );
}
