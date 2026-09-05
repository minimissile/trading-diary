import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, DatePicker, Empty, Form, Input, InputNumber, Select, Skeleton, Table, Tabs, Tag } from 'antd';
import { ExperimentOutlined, PlayCircleOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { Link } from 'react-router';
import dayjs from 'dayjs';
import { STOCK_STRATEGIES, completedStrategyDate } from '../../shared/strategy/catalog';
import type {
  StockBacktestResult,
  StockCandidate,
  StockScreenResult,
  StockStrategySettings,
  StockStrategyState,
  StrategyTrade,
} from '../../shared/strategy/types';
import { stockStrategySettingsSchema } from '../../shared/schemas/requests/stock-strategy.requests';
import { StrategyEquityChart } from '../components/trading/StrategyEquityChart';
import { AiStockSelection } from '../components/trading/AiStockSelection';
import { SELECTION_PLATFORMS } from '../../shared/strategy/ai-selection';
import { buildPositionChartPath } from '../router/paths';
import { ValueDisplay } from '../lib/trading-format';
import '../styles/stock-strategy.css';

const stateKey = ['stock-strategy', 'state'] as const;
const poolNames = { personal: '我的自选（沪深股票）', research: '内置观察池（固定名单）', custom: '自定义股票池' };
const money = (value: number): string => value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function StockStrategyPage(): React.JSX.Element {
  const state = useQuery({ queryKey: stateKey, queryFn: () => window.desktop.stockStrategy.getState(), retry: false });
  return (
    <div className="stock-strategy-page">
      <header className="stock-strategy-heading">
        <div>
          <span className="stock-strategy-eyebrow">A 股 · 日线研究</span>
          <h1>策略选股</h1>
          <p>用规则发现买入候选，用历史表现检验交易思路。</p>
        </div>
        <Tag icon={<ExperimentOutlined />} color="processing">
          研究模式
        </Tag>
      </header>
      {state.isPending ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : state.isError ? (
        <Alert
          type="error"
          showIcon
          title="策略工作区加载失败"
          description={state.error.message}
          action={<Button onClick={() => void state.refetch()}>重试</Button>}
        />
      ) : (
        <StrategyWorkspace initial={state.data} />
      )}
    </div>
  );
}

function StrategyWorkspace({ initial }: { initial: StockStrategyState }): React.JSX.Element {
  const { message } = App.useApp();
  const client = useQueryClient();
  const [active, setActive] = useState(initial.settings);
  const [draft, setDraft] = useState(initial.settings);
  const [symbols, setSymbols] = useState(initial.settings.symbols.join(', '));
  const [validation, setValidation] = useState<string | null>(null);
  const [history, setHistory] = useState(initial.screens);
  const [historical, setHistorical] = useState<StockScreenResult | null>(null);
  const [backtest, setBacktest] = useState(initial.lastBacktest);
  const [startDate, setStartDate] = useState(dayjs(completedStrategyDate()).subtract(1, 'year').format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState(completedStrategyDate());
  const [tab, setTab] = useState('daily');
  const screenKey = ['stock-strategy', 'screen', active];
  const daily = useQuery({
    queryKey: screenKey,
    queryFn: async () => {
      const result = await window.desktop.stockStrategy.screen({ settings: active });
      void client.invalidateQueries({ queryKey: stateKey });
      return result;
    },
    enabled: tab === 'daily',
    retry: false,
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const snapshot = historical ?? daily.data;
  const selected = STOCK_STRATEGIES.find((item) => item.id === draft.strategyId)!;
  const save = useMutation({
    mutationFn: (settings: StockStrategySettings) => window.desktop.stockStrategy.saveSettings(settings),
    onSuccess: (settings) => {
      setActive(settings);
      setDraft(settings);
      setHistorical(null);
      void client.invalidateQueries({ queryKey: stateKey });
      void message.success('策略配置已保存');
    },
  });
  const refresh = useMutation({
    mutationFn: () => window.desktop.stockStrategy.screen({ settings: active, refresh: true }),
    onSuccess: (result) => {
      client.setQueryData(screenKey, result);
      setHistorical(null);
      setHistory((previous) => [result, ...previous.filter((item) => item.id !== result.id)].slice(0, 30));
      void client.invalidateQueries({ queryKey: stateKey });
    },
  });
  const run = useMutation({
    mutationFn: () => window.desktop.stockStrategy.backtest({ settings: active, startDate, endDate }),
    onSuccess: (result) => {
      setBacktest(result);
      void client.invalidateQueries({ queryKey: stateKey });
    },
  });
  const add = useMutation({
    mutationFn: (symbol: string) => window.desktop.watchlist.add({ symbol }),
    onSuccess: (result) => {
      void message.success(result.alreadyExists ? '已在我的自选中' : '已加入我的自选');
      void client.invalidateQueries({ queryKey: ['watchlist'] });
    },
    onError: (error) => void message.error(error.message),
  });
  const editedSettings = { ...draft, symbols: symbols.split(/[\s,，;；]+/u).filter(Boolean) };
  const dirty = JSON.stringify(editedSettings) !== JSON.stringify(active);
  const busy = save.isPending || run.isPending || refresh.isPending || daily.isFetching;
  const update = <K extends keyof StockStrategySettings>(key: K, value: StockStrategySettings[K]): void => {
    setDraft((previous) => ({ ...previous, [key]: value, ...(key === 'poolId' ? { selectionSource: undefined } : {}) }));
    setValidation(null);
  };
  const apply = (): void => {
    const parsed = stockStrategySettingsSchema.safeParse(editedSettings);
    if (!parsed.success) {
      setValidation(parsed.error.issues.map((issue) => issue.message).join('；'));
      return;
    }
    save.mutate(parsed.data);
  };
  const allHistory = [
    ...new Map([...(daily.data ? [daily.data] : []), ...initial.screens, ...history].map((item) => [item.id, item])).values(),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30);
  const candidateColumns: ColumnsType<StockCandidate> = [
    {
      title: '排名 / 标的',
      key: 'symbol',
      width: 174,
      render: (_, row) => (
        <div className="stock-strategy-stock">
          <b>{row.rank.toString().padStart(2, '0')}</b>
          <span>
            <Link to={buildPositionChartPath(row.symbol)}>{row.name}</Link>
            <small>{row.symbol}</small>
          </span>
        </div>
      ),
    },
    { title: '参考收盘价', dataIndex: 'referencePrice', align: 'right', width: 110, render: (value: number) => money(value) },
    { title: '策略分数', dataIndex: 'score', align: 'right', width: 96, render: (value: number) => value.toFixed(2) },
    {
      title: '20 日涨幅',
      dataIndex: 'momentum20',
      align: 'right',
      width: 110,
      render: (value: number) => <ValueDisplay kind="percent" value={value} />,
    },
    { title: '量比', dataIndex: 'volumeRatio', align: 'right', width: 84, render: (value: number) => `${value.toFixed(2)}×` },
    {
      title: '入选理由',
      dataIndex: 'reasons',
      width: 280,
      render: (value: string[]) => <span className="stock-strategy-reasons">{value.join(' · ')}</span>,
    },
    {
      title: '跟踪',
      key: 'action',
      width: 110,
      render: (_, row) => (
        <Button size="small" loading={add.isPending && add.variables === row.symbol} onClick={() => add.mutate(row.symbol)}>
          加入自选
        </Button>
      ),
    },
  ];
  const error = validation ?? save.error?.message;
  return (
    <>
      <AiStockSelection
        disabled={busy}
        onUsePool={async (result) => {
          const next = stockStrategySettingsSchema.parse({
            ...editedSettings,
            poolId: 'custom',
            symbols: result.stocks.map((stock) => stock.symbol),
            selectionSource: {
              platform: result.platform,
              query: result.query,
              queriedAt: result.createdAt,
              snapshotId: result.id,
            },
          });
          const saved = await window.desktop.stockStrategy.saveSettings(next);
          setActive(saved);
          setDraft(saved);
          setSymbols(saved.symbols.join(', '));
          setHistorical(null);
          setValidation(null);
          setTab('daily');
          void client.invalidateQueries({ queryKey: stateKey });
        }}
      />
      <section className="stock-strategy-config ui-panel" aria-label="策略配置">
        <div className="stock-strategy-section-heading">
          <div>
            <h2>选择策略</h2>
            <p>配置同时用于每日选股和历史回测</p>
          </div>
          <Button type="primary" icon={<SaveOutlined />} disabled={!dirty || busy} loading={save.isPending} onClick={apply}>
            保存并应用
          </Button>
        </div>
        {draft.selectionSource ? (
          <Alert
            type="info"
            showIcon
            title={`股票池来源：${SELECTION_PLATFORMS[draft.selectionSource.platform].name}`}
            description={`${new Date(draft.selectionSource.queriedAt).toLocaleString('zh-CN')} · ${draft.selectionSource.query}。历史回测仅检验此固定名单，不代表平台条件的历史选股收益。`}
          />
        ) : null}
        <div className="stock-strategy-cards">
          {STOCK_STRATEGIES.map((strategy) => (
            <button
              key={strategy.id}
              type="button"
              disabled={busy}
              aria-pressed={draft.strategyId === strategy.id}
              className={draft.strategyId === strategy.id ? 'selected' : ''}
              onClick={() => update('strategyId', strategy.id)}
            >
              <strong>{strategy.name}</strong>
              <span>{strategy.description}</span>
            </button>
          ))}
        </div>
        <div className="stock-strategy-rules">
          {selected.rules.map((rule, index) => (
            <span key={rule}>
              <b>{index + 1}</b>
              {rule}
            </span>
          ))}
        </div>
        <Form layout="vertical" className="stock-strategy-form" disabled={busy}>
          <Form.Item label="股票池">
            <Select
              aria-label="股票池"
              value={draft.poolId}
              onChange={(value) => update('poolId', value)}
              options={Object.entries(poolNames).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          <Form.Item label="候选 / 最多持仓数">
            <InputNumber
              aria-label="候选数量"
              min={1}
              max={20}
              precision={0}
              value={draft.topN}
              onChange={(value) => {
                if (value !== null) update('topN', value);
              }}
            />
          </Form.Item>
          <Form.Item label="持有期限（交易日）">
            <InputNumber
              aria-label="持有期限"
              min={1}
              max={60}
              precision={0}
              value={draft.holdingDays}
              onChange={(value) => {
                if (value !== null) update('holdingDays', value);
              }}
            />
          </Form.Item>
          <Form.Item label="收盘止损（%）">
            <InputNumber
              aria-label="止损比例"
              min={1}
              max={50}
              value={draft.stopLossPercent}
              onChange={(value) => {
                if (value !== null) update('stopLossPercent', value);
              }}
            />
          </Form.Item>
          <Form.Item label="收盘止盈（%）">
            <InputNumber
              aria-label="止盈比例"
              min={1}
              max={200}
              value={draft.takeProfitPercent}
              onChange={(value) => {
                if (value !== null) update('takeProfitPercent', value);
              }}
            />
          </Form.Item>
        </Form>
        {draft.poolId === 'custom' ? (
          <label className="stock-strategy-symbol-input">
            沪深股票代码，空格或逗号分隔（最多 60 只）
            <Input.TextArea
              aria-label="自定义股票代码"
              disabled={busy}
              value={symbols}
              onChange={(event) => {
                setSymbols(event.target.value);
                setDraft((previous) => ({ ...previous, selectionSource: undefined }));
              }}
              placeholder="600036, 000333, 300750"
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          </label>
        ) : null}
        <details className="stock-strategy-costs">
          <summary>回测资金与交易成本 · 点击调整</summary>
          <Form layout="vertical" className="stock-strategy-form" disabled={busy}>
            {(
              [
                ['initialCapital', '初始资金（元）', 10_000, 100_000_000],
                ['commissionBps', '双向佣金（万分之）', 0, 100],
                ['minimumCommission', '单笔最低佣金（元）', 0, 100],
                ['stampDutyBps', '卖出印花税（万分之）', 0, 100],
                ['slippageBps', '单边滑点（万分之）', 0, 100],
              ] as const
            ).map(([key, label, min, max]) => (
              <Form.Item label={label} key={key}>
                <InputNumber
                  aria-label={label}
                  min={min}
                  max={max}
                  value={draft[key]}
                  onChange={(value) => {
                    if (value !== null) update(key, value);
                  }}
                />
              </Form.Item>
            ))}
          </Form>
        </details>
        {dirty ? <p className="stock-strategy-pending">参数已修改，保存并应用后生效。</p> : null}
        {error ? <Alert type="error" showIcon title={error} /> : null}
      </section>
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: 'daily',
            label: '每日买入候选',
            children: (
              <section className="stock-strategy-results ui-panel">
                <div className="stock-strategy-section-heading">
                  <div>
                    <h2>{historical ? '历史候选' : '每日买入候选'}</h2>
                    <p>打开本页每分钟检查更新，缓存 15 分钟；15:30 后使用当日日线。应用关闭后不运行。</p>
                  </div>
                  <div className="stock-strategy-actions">
                    <Select
                      aria-label="历史选股结果"
                      value={historical?.id ?? 'latest'}
                      onChange={(value) => setHistorical(allHistory.find((item) => item.id === value) ?? null)}
                      options={[
                        { value: 'latest', label: '当前策略 · 最新信号' },
                        ...allHistory.map((item) => ({
                          value: item.id,
                          label: `${item.signalDate} · ${STOCK_STRATEGIES.find((s) => s.id === item.settings.strategyId)?.name} · ${new Date(item.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`,
                        })),
                      ]}
                    />
                    <Button
                      icon={<ReloadOutlined />}
                      disabled={busy || dirty}
                      loading={refresh.isPending || daily.isFetching}
                      onClick={() => refresh.mutate()}
                    >
                      重新选股
                    </Button>
                  </div>
                </div>
                {(refresh.error ?? daily.error) ? (
                  <Alert
                    type="error"
                    showIcon
                    title="选股未完成"
                    description={(refresh.error ?? daily.error)?.message}
                    action={
                      <Button disabled={busy} onClick={() => refresh.mutate()}>
                        重试
                      </Button>
                    }
                  />
                ) : null}
                {snapshot ? (
                  <>
                    <div className="stock-strategy-metrics">
                      <Metric label="信号日期" value={snapshot.signalDate} />
                      <Metric label="买入候选" value={`${snapshot.candidates.length} 只`} />
                      <Metric label="有效扫描 / 股票池" value={`${snapshot.evaluatedCount} / ${snapshot.universe.length}`} />
                      <Metric label="用于" value="下一实际交易日" />
                    </div>
                    <div className="stock-strategy-result-context">
                      <Tag color="processing">{STOCK_STRATEGIES.find((s) => s.id === snapshot.settings.strategyId)?.name}</Tag>
                      <Tag>{poolNames[snapshot.settings.poolId]}</Tag>
                      <span>
                        生成于 {new Date(snapshot.createdAt).toLocaleString('zh-CN')} ·
                        策略分数用于排序，不是上涨概率；参考价不是下单价格。
                      </span>
                    </div>
                    <Table
                      columns={candidateColumns}
                      dataSource={snapshot.candidates}
                      rowKey="symbol"
                      pagination={false}
                      size="small"
                      scroll={{ x: 1080 }}
                      locale={{
                        emptyText: (
                          <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description={
                              snapshot.evaluatedCount
                                ? '当日没有满足策略条件的股票，可保持观察'
                                : '没有可参与筛选的数据，请检查排除明细'
                            }
                          />
                        ),
                      }}
                    />
                    <details className="stock-strategy-notes">
                      <summary>数据范围与排除明细（{snapshot.exclusions.length}）</summary>
                      {snapshot.warnings.map((warning) => (
                        <p key={warning}>{warning}</p>
                      ))}
                      <p>本次股票池：{snapshot.universe.map((item) => item.symbol).join('、')}</p>
                      {snapshot.exclusions.map((item) => (
                        <p key={item.symbol}>
                          {item.name} {item.symbol} · {item.reason}
                        </p>
                      ))}
                    </details>
                  </>
                ) : daily.isFetching ? (
                  <div className="stock-strategy-loading">
                    <Skeleton active paragraph={{ rows: 5 }} />
                    <p>正在读取股票池完整日线，首次扫描可能需要约两分钟。</p>
                  </div>
                ) : (
                  <Empty description="尚无选股结果" />
                )}
              </section>
            ),
          },
          {
            key: 'backtest',
            label: '历史回测',
            children: (
              <section className="stock-strategy-results ui-panel">
                <div className="stock-strategy-section-heading">
                  <div>
                    <h2>历史回测</h2>
                    <p>逐日产生信号，次日开盘成交；空余仓位保留现金。</p>
                  </div>
                  <div className="stock-strategy-actions">
                    <DatePicker
                      aria-label="回测开始日期"
                      allowClear={false}
                      value={dayjs(startDate)}
                      disabled={busy}
                      onChange={(value) => {
                        if (value) setStartDate(value.format('YYYY-MM-DD'));
                      }}
                    />
                    <span>至</span>
                    <DatePicker
                      aria-label="回测结束日期"
                      allowClear={false}
                      value={dayjs(endDate)}
                      disabled={busy}
                      onChange={(value) => {
                        if (value) setEndDate(value.format('YYYY-MM-DD'));
                      }}
                    />
                    <Button
                      type="primary"
                      icon={<PlayCircleOutlined />}
                      loading={run.isPending}
                      disabled={busy || dirty}
                      onClick={() => run.mutate()}
                    >
                      运行回测
                    </Button>
                  </div>
                </div>
                <p className="stock-strategy-caption">
                  单次最长 2 年，需额外 61 根预热日线。最低日期 2023-08-28；最多 60 只沪深股票。
                </p>
                {run.error ? <Alert type="error" showIcon title="回测未完成" description={run.error.message} /> : null}
                {run.isPending ? (
                  <Alert type="info" showIcon title="正在准备历史行情并回测" description="首轮需要下载原始与复权日线，请稍候。" />
                ) : null}
                {backtest ? (
                  <BacktestReport result={backtest} />
                ) : !run.isPending ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择区间后运行回测，查看收益、回撤与成交记录" />
                ) : null}
              </section>
            ),
          },
        ]}
      />
    </>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <div className="stock-strategy-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function BacktestReport({ result }: { result: StockBacktestResult }): React.JSX.Element {
  const columns: ColumnsType<StrategyTrade> = [
    {
      title: '成交日 / 信号日',
      key: 'date',
      width: 158,
      render: (_, row) => (
        <span>
          {row.date}
          <small className="ui-cell-secondary">信号 {row.signalDate}</small>
        </span>
      ),
    },
    {
      title: '标的',
      key: 'symbol',
      width: 136,
      render: (_, row) => (
        <span>
          {row.name}
          <small className="ui-cell-secondary">{row.symbol}</small>
        </span>
      ),
    },
    {
      title: '方向',
      dataIndex: 'side',
      width: 74,
      render: (side: string) => <Tag color={side === 'buy' ? 'processing' : 'warning'}>{side === 'buy' ? '买入' : '卖出'}</Tag>,
    },
    { title: '模拟价格', dataIndex: 'price', align: 'right', width: 108, render: (value: number) => money(value) },
    { title: '等效股数', dataIndex: 'quantity', align: 'right', width: 108, render: (value: number) => money(value) },
    { title: '成交额', dataIndex: 'amount', align: 'right', width: 116, render: (value: number) => money(value) },
    { title: '费用', dataIndex: 'fees', align: 'right', width: 90, render: (value: number) => money(value) },
    {
      title: '平仓净盈亏',
      dataIndex: 'pnl',
      align: 'right',
      width: 120,
      render: (value: number | null) => <ValueDisplay kind="currency" value={value} />,
    },
    { title: '触发原因', dataIndex: 'reason', width: 260 },
  ];
  return (
    <div className="stock-strategy-report">
      <div className="stock-strategy-result-context">
        <Tag color="processing">{STOCK_STRATEGIES.find((item) => item.id === result.input.settings.strategyId)?.name}</Tag>
        <span>
          上次成功结果 · {new Date(result.createdAt).toLocaleString('zh-CN')} · 区间 {result.startDate} — {result.endDate} ·{' '}
          {result.universe.length} 只股票 · 初始 ¥{money(result.input.settings.initialCapital)}
        </span>
      </div>
      <div className="stock-strategy-metrics">
        <Metric label="策略总收益" value={<ValueDisplay kind="percent" value={result.totalReturnPercent} />} />
        <Metric label="沪深 300 收益" value={<ValueDisplay kind="percent" value={result.benchmarkReturnPercent} />} />
        <Metric label="最大回撤" value={`${result.maxDrawdownPercent.toFixed(2)}%`} />
        <Metric
          label={`平仓胜率 · ${result.closedTrades} 笔`}
          value={result.winRatePercent === null ? '—' : `${result.winRatePercent.toFixed(1)}%`}
        />
      </div>
      <StrategyEquityChart curve={result.curve} />
      <div className="stock-strategy-report-facts">
        <span>
          年化{' '}
          {result.annualizedReturnPercent === null ? '区间不足 30 天，不展示' : `${result.annualizedReturnPercent.toFixed(2)}%`}
        </span>
        <span>期末资产 ¥{money(result.finalEquity)}</span>
        <span>累计费用 ¥{money(result.fees)}</span>
        <span>未平仓 {result.openPositions} 只</span>
        <span>未成交尝试 {result.skippedOrders} 次</span>
      </div>
      <details className="stock-strategy-notes" open>
        <summary>回测口径与局限</summary>
        {result.warnings.map((warning) => (
          <p key={warning}>{warning}</p>
        ))}
        <p>
          持有期限 {result.input.settings.holdingDays} 日；最多 {result.input.settings.topN} 只；止损{' '}
          {result.input.settings.stopLossPercent}% / 止盈 {result.input.settings.takeProfitPercent}%；佣金万{' '}
          {result.input.settings.commissionBps}，最低 {result.input.settings.minimumCommission} 元；印花税万{' '}
          {result.input.settings.stampDutyBps}，滑点万 {result.input.settings.slippageBps}。
        </p>
        <p>固定股票池：{result.universe.map((stock) => `${stock.name} ${stock.symbol}`).join('、')}</p>
      </details>
      <h3>模拟成交明细</h3>
      <Table
        columns={columns}
        dataSource={result.trades}
        rowKey={(row) => `${row.date}:${row.symbol}:${row.side}`}
        size="small"
        scroll={{ x: 1280 }}
        pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => `共 ${total} 笔` }}
        locale={{ emptyText: '区间内没有满足条件且可以成交的信号' }}
      />
    </div>
  );
}
