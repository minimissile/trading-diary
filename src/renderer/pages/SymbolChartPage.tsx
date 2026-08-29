import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Alert, Button, Checkbox, Segmented, Space, Tag } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
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
    () => (isOtcFund ? fundChartPeriodOptions : chartPeriodOptions).map((option) => ({
      label: option.label,
      value: option.value,
    })),
    [isOtcFund],
  );

  if (!symbol) {
    return <main className="workspace-page symbol-chart-page" />;
  }

  return (
    <main className="workspace-page symbol-chart-page">
      <header className="page-header">
        <div>
          <p className="page-kicker">CHART</p>
          <h1>{symbolName || symbol}</h1>
          <p className="page-intro">
            {isOtcFund ? '场外基金净值走势与指标分析，数据来自东方财富。' : 'K 线看盘与指标分析，数据来自东方财富。'}
          </p>
        </div>
        <div className="symbol-chart-header-actions">
          <div className="symbol-chart-quote">
            <span>{quoteSummary || '等待行情…'}</span>
          </div>
          <Button icon={<ArrowLeftOutlined />} onClick={() => void navigate(routePaths.positions)}>
            返回持仓
          </Button>
          <Button onClick={() => void loadSymbolMeta()}>刷新行情</Button>
        </div>
      </header>

      <section className="settings-panel symbol-chart-controls">
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Space wrap>
            <Tag>{kindLabels[instrumentKind]}</Tag>
            <Tag color="blue">数据源：东方财富</Tag>
            <Tag>滚轮缩放 · 拖拽平移 · 十字光标</Tag>
          </Space>

          <div className="symbol-chart-control-row">
            <span className="symbol-chart-control-label">周期</span>
            <Segmented
              options={periodSegmentOptions}
              value={period}
              onChange={(value) => setPeriod(value as KLinePeriod)}
            />
          </div>

          {!isOtcFund ? (
            <div className="symbol-chart-control-row">
              <span className="symbol-chart-control-label">复权</span>
              <Segmented
                options={adjustOptions}
                value={adjust}
                onChange={(value) => setAdjust(value as KLineAdjust)}
              />
            </div>
          ) : null}

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
            <Checkbox.Group
              options={(isOtcFund ? chartSubIndicatorOptions.filter((name) => name !== 'VOL') : chartSubIndicatorOptions).map(
                (name) => ({ label: name, value: name }),
              )}
              value={subIndicators}
              onChange={(values) => setSubIndicators(values as ChartSubIndicator[])}
            />
          </div>

          {chartError ? <Alert type="error" showIcon message={chartError} /> : null}
        </Space>
      </section>

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
