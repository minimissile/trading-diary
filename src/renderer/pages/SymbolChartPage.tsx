import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Alert, Button, Checkbox, Popover, Segmented, Tag } from 'antd';
import { ArrowLeftOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router';
import type { InstrumentKind, KLineAdjust, KLinePeriod } from '../../shared/market/types';
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
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { symbol: symbolParam } = useParams();
  const symbol = parsePositionChartSymbol(symbolParam);
  const [symbolName, setSymbolName] = useState('');
  const [instrumentKind, setInstrumentKind] = useState<InstrumentKind>('stock');
  const [period, setPeriod] = useState<KLinePeriod>('1d');
  const [adjust, setAdjust] = useState<KLineAdjust>('forward');
  const [mainIndicators, setMainIndicators] = useState<ChartMainIndicator[]>(['MA', 'BOLL']);
  const [subIndicators, setSubIndicators] = useState<ChartSubIndicator[]>(['VOL', 'MACD']);
  const [quoteSummary, setQuoteSummary] = useState('');
  const [chartError, setChartError] = useState<string | null>(null);

  const isOtcFund = instrumentKind === 'otc_fund';

  const loadSymbolMeta = useCallback(async (): Promise<void> => {
    if (!symbol) return;
    try {
      const snapshot = await window.desktop.market.getSnapshot(symbol);
      setSymbolName(snapshot.instrument.name);
      setInstrumentKind(snapshot.instrument.kind);
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
      void message.error(reason instanceof Error ? reason.message : '加载行情失败');
    }
  }, [message, symbol]);

  useEffect(() => {
    if (!symbol) {
      void navigate(routePaths.positions, { replace: true });
      return;
    }
    void loadSymbolMeta();
  }, [loadSymbolMeta, navigate, symbol]);

  useEffect(() => {
    setChartError(null);
  }, [symbol, period, adjust, instrumentKind]);

  useEffect(() => {
    if (instrumentKind === 'otc_fund') {
      setPeriod('1d');
      setAdjust('none');
      setMainIndicators(['MA']);
      setSubIndicators(['MACD']);
      return;
    }
    setMainIndicators(['MA', 'BOLL']);
    setSubIndicators(['VOL', 'MACD']);
  }, [instrumentKind]);

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
      (isOtcFund ? chartSubIndicatorOptions.filter((name) => name !== 'VOL') : chartSubIndicatorOptions).map(
        (name) => ({ label: name, value: name }),
      ),
    [isOtcFund],
  );

  const indicatorPanel = (
    <div className="symbol-chart-indicator-panel">
      <div className="symbol-chart-control-row">
        <span className="symbol-chart-control-label">主图</span>
        <Checkbox.Group
          options={chartMainIndicatorOptions.map((name) => ({ label: name, value: name }))}
          value={mainIndicators}
          onChange={(values) => setMainIndicators(values as ChartMainIndicator[])}
        />
      </div>
      <div className="symbol-chart-control-row">
        <span className="symbol-chart-control-label">副图</span>
        <Checkbox.Group options={subIndicatorOptions} value={subIndicators} onChange={(values) => setSubIndicators(values as ChartSubIndicator[])} />
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
          <Button type="text" className="symbol-chart-back" icon={<ArrowLeftOutlined />} onClick={() => void navigate(routePaths.positions)}>
            返回
          </Button>
          <div className="symbol-chart-title-block">
            <strong className="symbol-chart-title">{symbolName || symbol}</strong>
            <span className="symbol-chart-code">{symbol}</span>
            <Tag className="symbol-chart-kind-tag">{kindLabels[instrumentKind]}</Tag>
          </div>
          <span className="symbol-chart-quote">{quoteSummary || '—'}</span>
        </div>

        <div className="symbol-chart-toolbar-right">
          <Segmented size="small" options={periodSegmentOptions} value={period} onChange={(value) => setPeriod(value as KLinePeriod)} />
          {!isOtcFund ? (
            <Segmented size="small" options={adjustOptions} value={adjust} onChange={(value) => setAdjust(value as KLineAdjust)} />
          ) : null}
          <Popover content={indicatorPanel} trigger="click" placement="bottomRight" title="指标">
            <Button size="small" icon={<SettingOutlined />}>
              指标
            </Button>
          </Popover>
          <Button size="small" icon={<ReloadOutlined />} aria-label="刷新行情" onClick={() => void loadSymbolMeta()} />
        </div>
      </header>

      {chartError ? <Alert className="symbol-chart-error" type="error" showIcon message={chartError} /> : null}

      <section className="symbol-chart-stage">
        <TradingChart
          symbol={symbol}
          name={symbolName}
          kind={instrumentKind}
          period={period}
          adjust={adjust}
          mainIndicators={[...mainIndicators]}
          subIndicators={[...subIndicators]}
          onLoadError={(errorMessage) => setChartError(errorMessage)}
        />
      </section>
    </main>
  );
}
