import { ArrowLeftOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import { Alert, App, Button, Checkbox, Popover, Segmented, Tag } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { buildChartTradeMarkers } from '../../shared/chart/trade-markers';
import type { InstrumentKind, KLineAdjust, KLinePeriod } from '../../shared/market/types';
import type { PortfolioLedgerEntry } from '../../shared/portfolio/types';
import { TradingChart } from '../components/chart/TradingChart';
import {
  chartMainIndicatorOptions,
  chartPeriodOptions,
  chartSubIndicatorOptions,
  fundChartPeriodOptions,
  type ChartMainIndicator,
  type ChartSubIndicator,
} from '../lib/chart/period-map';
import { parsePositionChartSymbol, routePaths } from '../router/paths';

const adjustOptions: Array<{ label: string; value: KLineAdjust }> = [
  { label: '前复权', value: 'forward' },
  { label: '不复权', value: 'none' },
  { label: '后复权', value: 'backward' },
];

const kindLabels: Record<InstrumentKind, string> = {
  stock: 'A股',
  etf: 'ETF',
  lof: 'LOF',
  otc_fund: '场外基金',
};

/**
 * 持仓标的 K 线页，从持仓中心进入的二级页面。
 */
export function SymbolChartPage(): React.JSX.Element {
  const { symbol } = useParams();
  return <SymbolChartContent key={symbol} />;
}

function SymbolChartContent(): React.JSX.Element {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { symbol: symbolParam } = useParams();
  const symbol = parsePositionChartSymbol(symbolParam);
  const [symbolName, setSymbolName] = useState('');
  const [instrumentKind, setInstrumentKind] = useState<InstrumentKind | null>(null);
  const [period, setPeriod] = useState<KLinePeriod>('1d');
  const [adjust, setAdjust] = useState<KLineAdjust>('forward');
  const [mainIndicators, setMainIndicators] = useState<ChartMainIndicator[]>(['MA', 'BOLL']);
  const [subIndicators, setSubIndicators] = useState<ChartSubIndicator[]>(['VOL', 'MACD']);
  const [quoteSummary, setQuoteSummary] = useState('');
  const [chartError, setChartError] = useState<string | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<PortfolioLedgerEntry[]>([]);
  const [showTradeMarkers, setShowTradeMarkers] = useState(true);

  const isOtcFund = instrumentKind === 'otc_fund';
  const chartKind = instrumentKind ?? 'stock';

  const loadSymbolMeta = useCallback(async (): Promise<void> => {
    if (!symbol) return;
    try {
      const snapshot = await window.desktop.market.getSnapshot(symbol);
      setSymbolName(snapshot.instrument.name);
      setInstrumentKind(snapshot.instrument.kind);
      if (snapshot.instrument.kind === 'otc_fund') {
        setPeriod('1d');
        setAdjust('none');
        setMainIndicators(['MA']);
        setSubIndicators(['MACD']);
      } else {
        setMainIndicators(['MA', 'BOLL']);
        setSubIndicators(['VOL', 'MACD']);
      }
      setChartError(null);

      const quote = snapshot.quote;
      const price = quote.price?.toFixed(snapshot.instrument.kind === 'otc_fund' ? 4 : 2) ?? '—';
      const changePercent =
        quote.changePercent === null || quote.changePercent === undefined
          ? '—'
          : `${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent.toFixed(2)}%`;
      setQuoteSummary(`${price}  ${changePercent}`);
    } catch (reason) {
      setSymbolName('');
      setQuoteSummary('');
      setInstrumentKind('stock');
      void message.error(reason instanceof Error ? reason.message : '加载行情失败');
    }
  }, [message, symbol]);

  const loadTradeMarkers = useCallback(async (): Promise<void> => {
    if (!symbol) return;
    try {
      const entries = await window.desktop.portfolio.listLedgerEntries(undefined, symbol);
      setLedgerEntries(entries);
    } catch {
      setLedgerEntries([]);
    }
  }, [symbol]);

  useEffect(() => {
    if (!symbol) {
      void navigate(routePaths.positions, { replace: true });
      return;
    }
    // Loads quote metadata through IPC; state changes occur when the external request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSymbolMeta();
    void loadTradeMarkers();
  }, [loadSymbolMeta, loadTradeMarkers, navigate, symbol]);

  useEffect(() => {
    const refresh = (): void => {
      void loadTradeMarkers();
    };
    window.addEventListener('workspace-changed', refresh);
    return () => window.removeEventListener('workspace-changed', refresh);
  }, [loadTradeMarkers]);

  const periodSegmentOptions = useMemo(
    () =>
      (isOtcFund ? fundChartPeriodOptions : chartPeriodOptions).map((option) => ({
        label: option.label,
        value: option.value,
      })),
    [isOtcFund],
  );

  const subIndicatorOptions = useMemo(
    () =>
      (isOtcFund ? chartSubIndicatorOptions.filter((name) => name !== 'VOL') : chartSubIndicatorOptions).map((name) => ({
        label: name,
        value: name,
      })),
    [isOtcFund],
  );

  const tradeMarkers = useMemo(
    () => buildChartTradeMarkers(ledgerEntries, isOtcFund ? '1d' : period),
    [isOtcFund, ledgerEntries, period],
  );

  const tradeMarkerSummary = useMemo(() => {
    const buyCount = tradeMarkers.filter((marker) => marker.side === 'buy').length;
    const sellCount = tradeMarkers.filter((marker) => marker.side === 'sell').length;
    const reinvestCount = tradeMarkers.filter((marker) => marker.side === 'dividend_reinvest').length;
    return { buyCount, sellCount, reinvestCount, total: tradeMarkers.length };
  }, [tradeMarkers]);

  const indicatorPanel = (
    <div className="symbol-chart-indicator-panel">
      <div className="symbol-chart-control-row">
        <span className="symbol-chart-control-label">主图</span>
        <Checkbox.Group
          options={chartMainIndicatorOptions.map((name) => ({ label: name, value: name }))}
          value={mainIndicators}
          onChange={(values) => setMainIndicators(values)}
        />
      </div>
      <div className="symbol-chart-control-row">
        <span className="symbol-chart-control-label">副图</span>
        <Checkbox.Group options={subIndicatorOptions} value={subIndicators} onChange={(values) => setSubIndicators(values)} />
      </div>
    </div>
  );

  if (!symbol) {
    return <main className="workspace-page symbol-chart-page" />;
  }

  return (
    <main className="workspace-page symbol-chart-page">
      <header className="symbol-chart-toolbar">
        <div className="symbol-chart-toolbar-left">
          <Button
            type="text"
            className="symbol-chart-back"
            icon={<ArrowLeftOutlined />}
            onClick={() => void navigate(routePaths.positions)}
          >
            返回
          </Button>
          <div className="symbol-chart-title-block">
            <strong className="symbol-chart-title">{symbolName || symbol}</strong>
            <span className="symbol-chart-code">{symbol}</span>
            <Tag className="symbol-chart-kind-tag">{instrumentKind ? kindLabels[instrumentKind] : '…'}</Tag>
          </div>
          <span className="symbol-chart-quote">{quoteSummary || '—'}</span>
        </div>

        <div className="symbol-chart-toolbar-right">
          <Segmented
            size="small"
            options={periodSegmentOptions}
            value={period}
            onChange={(value) => {
              setChartError(null);
              setPeriod(value);
            }}
          />
          {!isOtcFund ? (
            <Segmented
              size="small"
              options={adjustOptions}
              value={adjust}
              onChange={(value) => {
                setChartError(null);
                setAdjust(value);
              }}
            />
          ) : null}
          <Popover content={indicatorPanel} trigger="click" placement="bottomRight" title="指标">
            <Button size="small" icon={<SettingOutlined />}>
              指标
            </Button>
          </Popover>
          <Checkbox checked={showTradeMarkers} onChange={(event) => setShowTradeMarkers(event.target.checked)}>
            买卖点
          </Checkbox>
          {tradeMarkerSummary.total > 0 ? (
            <span className="symbol-chart-marker-legend">
              <Tag color="error">B {tradeMarkerSummary.buyCount}</Tag>
              <Tag color="success">S {tradeMarkerSummary.sellCount}</Tag>
              {tradeMarkerSummary.reinvestCount > 0 ? <Tag color="processing">再 {tradeMarkerSummary.reinvestCount}</Tag> : null}
            </span>
          ) : null}
          <Button
            size="small"
            icon={<ReloadOutlined />}
            aria-label="刷新行情"
            onClick={() => {
              void loadSymbolMeta();
              void loadTradeMarkers();
            }}
          />
        </div>
      </header>

      {chartError ? <Alert className="symbol-chart-error" type="error" showIcon message={chartError} /> : null}

      <section className="symbol-chart-stage">
        {instrumentKind ? (
          <TradingChart
            key={`${symbol}-${instrumentKind}`}
            symbol={symbol}
            name={symbolName}
            kind={chartKind}
            period={period}
            adjust={adjust}
            mainIndicators={mainIndicators}
            subIndicators={subIndicators}
            tradeMarkers={tradeMarkers}
            showTradeMarkers={showTradeMarkers}
            onLoadError={(errorMessage) => setChartError(errorMessage)}
          />
        ) : null}
      </section>
    </main>
  );
}
