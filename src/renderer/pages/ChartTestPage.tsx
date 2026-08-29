import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Checkbox, Input, Segmented, Space, Tag } from 'antd';
import type { KLineAdjust, KLinePeriod } from '../../shared/market/types';
import { TradingChart } from '../components/chart/TradingChart';
import {
  chartMainIndicatorOptions,
  chartPeriodOptions,
  chartSubIndicatorOptions,
  type ChartMainIndicator,
  type ChartSubIndicator,
} from '../lib/chart/period-map';

const adjustOptions: Array<{ label: string; value: KLineAdjust }> = [
  { label: '前复权', value: 'forward' },
  { label: '不复权', value: 'none' },
  { label: '后复权', value: 'backward' },
];

/**
 * 图表效果测试页，用于验证 K 线渲染、周期切换与指标展示。
 */
export function ChartTestPage(): React.JSX.Element {
  const { message } = App.useApp();
  const [symbolInput, setSymbolInput] = useState('600519');
  const [symbol, setSymbol] = useState('600519');
  const [symbolName, setSymbolName] = useState('贵州茅台');
  const [period, setPeriod] = useState<KLinePeriod>('1d');
  const [adjust, setAdjust] = useState<KLineAdjust>('forward');
  const [mainIndicators, setMainIndicators] = useState<ChartMainIndicator[]>(['MA', 'BOLL']);
  const [subIndicators, setSubIndicators] = useState<ChartSubIndicator[]>(['VOL', 'MACD']);
  const [quoteSummary, setQuoteSummary] = useState<string>('');

  const loadSymbolMeta = useCallback(async (nextSymbol: string): Promise<void> => {
    try {
      const snapshot = await window.desktop.market.getSnapshot(nextSymbol);
      setSymbolName(snapshot.instrument.name);
      const quote = snapshot.quote;
      const price = quote.price?.toFixed(2) ?? '—';
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
  }, [message]);

  useEffect(() => {
    void loadSymbolMeta(symbol);
  }, [loadSymbolMeta, symbol]);

  const applySymbol = (): void => {
    const normalized = symbolInput.trim().toUpperCase();
    if (!normalized) {
      void message.warning('请输入证券代码');
      return;
    }
    setSymbol(normalized);
  };

  const periodSegmentOptions = useMemo(
    () => chartPeriodOptions.map((option) => ({ label: option.label, value: option.value })),
    [],
  );

  return (
    <main className="workspace-page chart-test-page">
      <header className="page-header">
        <div>
          <p className="page-kicker">DEV ONLY</p>
          <h1>图表测试</h1>
          <p className="page-intro">
            基于 klinecharts 的 K 线看盘体验验证页，支持周期切换、复权方式与主/副图指标组合。
          </p>
        </div>
        <div className="chart-test-quote">
          <strong>{symbolName || symbol}</strong>
          <span>{quoteSummary || '等待行情…'}</span>
        </div>
      </header>

      <section className="settings-panel chart-test-controls">
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Space wrap>
            <Input
              style={{ width: 160 }}
              value={symbolInput}
              onChange={(event) => setSymbolInput(event.target.value)}
              onPressEnter={applySymbol}
              placeholder="证券代码"
            />
            <Button type="primary" onClick={applySymbol}>
              加载
            </Button>
            <Button onClick={() => void loadSymbolMeta(symbol)}>刷新行情</Button>
          </Space>

          <div className="chart-test-control-row">
            <span className="chart-test-control-label">周期</span>
            <Segmented
              options={periodSegmentOptions}
              value={period}
              onChange={(value) => setPeriod(value as KLinePeriod)}
            />
          </div>

          <div className="chart-test-control-row">
            <span className="chart-test-control-label">复权</span>
            <Segmented
              options={adjustOptions}
              value={adjust}
              onChange={(value) => setAdjust(value as KLineAdjust)}
            />
          </div>

          <div className="chart-test-control-row">
            <span className="chart-test-control-label">主图</span>
            <Checkbox.Group
              options={chartMainIndicatorOptions.map((name) => ({ label: name, value: name }))}
              value={mainIndicators}
              onChange={(values) => setMainIndicators(values as ChartMainIndicator[])}
            />
          </div>

          <div className="chart-test-control-row">
            <span className="chart-test-control-label">副图</span>
            <Checkbox.Group
              options={chartSubIndicatorOptions.map((name) => ({ label: name, value: name }))}
              value={subIndicators}
              onChange={(values) => setSubIndicators(values as ChartSubIndicator[])}
            />
          </div>

          <Space wrap>
            <Tag color="blue">数据源：东方财富</Tag>
            <Tag>滚轮缩放 · 拖拽平移 · 十字光标</Tag>
          </Space>
        </Space>
      </section>

      <section className="chart-test-stage">
        <TradingChart
          symbol={symbol}
          name={symbolName}
          period={period}
          adjust={adjust}
          mainIndicators={[...mainIndicators]}
          subIndicators={[...subIndicators]}
          height="calc(100vh - 360px)"
        />
      </section>
    </main>
  );
}
