import { useEffect, useState } from 'react';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Checkbox, Empty, Form, Input, InputNumber, Select, Skeleton, Table, Tag } from 'antd';
import { DownloadOutlined, PlayCircleOutlined, SaveOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  RESEARCH_TOOLS,
  researchRequestSchema,
  type ResearchKind,
  type ResearchReport,
  type ResearchRequest,
  type ResearchRow,
  type ResearchState,
} from '../../../shared/quant-research/workbench';

export function ResearchWorkbench({ kind }: { kind: ResearchKind }): React.JSX.Element {
  const state = useQuery({
    queryKey: ['quant-research', 'tool', kind],
    queryFn: () => window.desktop.quantResearch.getToolState(kind),
    retry: false,
  });
  if (state.isPending) return <Skeleton active paragraph={{ rows: 7 }} />;
  if (state.isError)
    return (
      <Alert
        type="error"
        showIcon
        title="研究工具加载失败"
        description={state.error.message}
        action={<Button onClick={() => void state.refetch()}>重试</Button>}
      />
    );
  return <ResearchTool key={kind} kind={kind} state={state.data} />;
}

function ResearchTool({ kind, state }: { kind: ResearchKind; state: ResearchState }): React.JSX.Element {
  const client = useQueryClient();
  const { message } = App.useApp();
  const [draft, setDraft] = useState(state.settings);
  const [symbols, setSymbols] = useState('symbols' in state.settings ? state.settings.symbols.join(', ') : '');
  const [validation, setValidation] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [monitor, setMonitor] = useState<Extract<ResearchRequest, { kind: 'lof' }> | null>(null);
  const stateKey = ['quant-research', 'tool', kind];
  const mutationKey = ['quant-research', 'execute', kind];
  const busy = useIsMutating({ mutationKey }) > 0;
  const run = useMutation({
    mutationKey,
    mutationFn: (input: ResearchRequest) => window.desktop.quantResearch.runTool(input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['quant-research', 'tool', kind] });
      setSelectedId(null);
    },
    onError: () => setMonitor(null),
  });
  const save = useMutation({
    mutationFn: (input: ResearchRequest) => window.desktop.quantResearch.saveToolSettings(input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: stateKey });
      void message.success('独立配置已保存');
    },
  });
  const selected = useQuery({
    queryKey: ['quant-research', 'report', selectedId],
    queryFn: () => window.desktop.quantResearch.getReport(selectedId!),
    enabled: selectedId !== null,
    retry: false,
  });
  const mutate = run.mutate;
  useEffect(() => {
    if (!monitor || monitor.refreshMinutes <= 0) return;
    const timer = window.setInterval(() => {
      if (!client.isMutating({ mutationKey: ['quant-research', 'execute', 'lof'] })) mutate(monitor);
    }, monitor.refreshMinutes * 60000);
    return () => window.clearInterval(timer);
  }, [monitor, client, mutate]);
  const tool = RESEARCH_TOOLS.find((t) => t.kind === kind)!;
  const update = (key: string, value: unknown) => setDraft((current) => ({ ...current, [key]: value }));
  const parse = (): ResearchRequest | null => {
    const parsed = researchRequestSchema.safeParse({
      ...draft,
      ...('symbols' in draft ? { symbols: [...new Set(symbols.split(/[\s,，;；]+/u).filter(Boolean))] } : {}),
    });
    if (!parsed.success) {
      setValidation(parsed.error.issues[0]?.message ?? '请检查输入');
      return null;
    }
    setValidation('');
    return parsed.data;
  };
  const numeric = (key: string, label: string, min: number, max: number, step = 1) => (
    <Form.Item label={label} key={key}>
      <InputNumber
        aria-label={label}
        value={Number(draft[key as keyof ResearchRequest])}
        min={min}
        max={max}
        step={step}
        onChange={(v) => {
          if (v !== null) update(key, v);
        }}
      />
    </Form.Item>
  );
  const dateField = (key: string, label: string) => (
    <Form.Item label={label} key={key}>
      <Input
        aria-label={label}
        type="date"
        value={String(draft[key as keyof ResearchRequest])}
        onChange={(e) => update(key, e.target.value)}
      />
    </Form.Item>
  );
  const report = selectedId ? selected.data : (run.data ?? state.latest);
  return (
    <div className="quant-workbench">
      <section className="quant-research-panel">
        <div className="quant-research-section-heading">
          <div>
            <h2>{tool.name}</h2>
            <p>{tool.description}</p>
          </div>
          <Tag>独立研究</Tag>
        </div>
        <Form layout="vertical" disabled={busy || save.isPending || monitor !== null} className="quant-workbench-form">
          {'symbol' in draft ? (
            <Form.Item label="股票代码">
              <Input
                aria-label="股票代码"
                value={draft.symbol}
                maxLength={6}
                onChange={(e) => update('symbol', e.target.value)}
              />
            </Form.Item>
          ) : null}
          {'endDate' in draft ? dateField('endDate', '截止日期') : null}
          {draft.kind === 'prices' ? numeric('days', '采集日线数量', 1, 600) : null}
          {draft.kind === 'backtest' ? (
            <>
              <Form.Item label="策略">
                <Select
                  aria-label="策略"
                  value={draft.strategy}
                  options={[
                    { value: 'ma', label: '收盘均线策略' },
                    { value: 'breakout', label: '前高突破策略' },
                  ]}
                  onChange={(v) => update('strategy', v)}
                />
              </Form.Item>
              {numeric('days', '回测交易日数', 20, 400)}
              {numeric('period', '策略周期', 2, 120)}
              {numeric('capital', '初始资金', 1000, 1e8, 1000)}
              {numeric('commissionBps', '佣金（基点）', 0, 100, 0.5)}
              {numeric('minCommission', '最低佣金（元）', 0, 100, 1)}
              {numeric('sellTaxBps', '卖出附加费（基点）', 0, 100, 0.5)}
              {numeric('slippageBps', '单边滑点（基点）', 0, 100, 0.5)}
            </>
          ) : null}
          {draft.kind === 'prediction' ? (
            <>
              {numeric('trainingDays', '滚动训练样本', 60, 240)}
              {numeric('testDays', '样本外检验日数', 20, 120)}
            </>
          ) : null}
          {draft.kind === 'lof' ? (
            <>
              {numeric('threshold', '折溢价阈值（%）', 0, 100, 0.5)}
              {numeric('feePct', '费用参考（%）', 0, 10, 0.1)}
              {numeric('refreshMinutes', '监控间隔（分钟）', 0, 60)}
            </>
          ) : null}
          {draft.kind === 'shares' ? (
            <>
              <Form.Item label="基金类型">
                <Select
                  aria-label="基金类型"
                  value={draft.fundType}
                  onChange={(v) => update('fundType', v)}
                  options={[
                    { value: 'etf', label: 'ETF' },
                    { value: 'lof', label: 'LOF' },
                  ]}
                />
              </Form.Item>
              {numeric('threshold', '份额变动阈值（%）', 0, 100, 0.5)}
            </>
          ) : null}
          {draft.kind === 'announcements' ? (
            <>
              {dateField('startDate', '开始日期')}
              <Form.Item label="标题关键词">
                <Input
                  aria-label="标题关键词"
                  value={draft.keyword}
                  onChange={(e) => update('keyword', e.target.value)}
                  placeholder="如：减持、业绩、回购"
                />
              </Form.Item>
            </>
          ) : null}
          {draft.kind === 'market' ? dateField('date', '观察日期') : null}
          {draft.kind === 'fundamentals' ? (
            <>
              {dateField('reportDate', '报告期（季度末）')}
              {numeric('minRoe', '最低 ROE（%）', -1000, 1000)}
              {numeric('minGrowth', '最低利润同比（%）', -1000, 10000)}
              <Form.Item label="盈利条件">
                <Checkbox checked={draft.excludeLoss} onChange={(e) => update('excludeLoss', e.target.checked)}>
                  排除净利润非正
                </Checkbox>
              </Form.Item>
            </>
          ) : null}
          {draft.kind === 'bonds' ? (
            <>
              {numeric('maxPrice', '最高转债价格', 1, 10000)}
              {numeric('maxPremium', '最高转股溢价（%）', -100, 1000)}
            </>
          ) : null}
          {'symbols' in draft ? (
            <Form.Item className="quant-workbench-symbols" label="限定代码（最多 30 个；留空使用本工具全部范围）">
              <Input.TextArea
                aria-label="限定代码"
                value={symbols}
                onChange={(e) => setSymbols(e.target.value)}
                autoSize={{ minRows: 1, maxRows: 3 }}
                placeholder="六位代码，空格或逗号分隔"
              />
            </Form.Item>
          ) : null}
        </Form>
        <div className="quant-research-actions">
          <Button
            icon={<SaveOutlined />}
            loading={save.isPending}
            disabled={busy || monitor !== null}
            onClick={() => {
              const v = parse();
              if (v) save.mutate(v);
            }}
          >
            保存配置
          </Button>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            loading={busy}
            disabled={busy || save.isPending || monitor !== null}
            onClick={() => {
              const v = parse();
              if (v) {
                setSelectedId(null);
                run.mutate(v);
              }
            }}
          >
            {kind === 'backtest' ? '运行独立回测' : kind === 'prediction' ? '运行实验' : '读取并分析'}
          </Button>
          {draft.kind === 'lof' ? (
            <Button
              disabled={!monitor && (busy || save.isPending || draft.refreshMinutes === 0)}
              onClick={() => {
                if (monitor) {
                  setMonitor(null);
                  return;
                }
                const v = parse();
                if (v?.kind === 'lof' && v.refreshMinutes > 0) {
                  setMonitor(v);
                  run.mutate(v);
                }
              }}
            >
              {monitor ? '停止监控' : '开始页面监控'}
            </Button>
          ) : null}
          {monitor ? <Tag color="processing">每 {monitor.refreshMinutes} 分钟刷新 · 离开此工具后停止</Tag> : null}
        </div>
        {kind === 'backtest' ? (
          <p className="quant-research-caption">1 基点 = 0.01%。按前复权价格及可分割模拟单位研究，不模拟真实整手与交易所撮合。</p>
        ) : null}
        {kind === 'shares' ? (
          <p className="quant-research-caption">首次采样建立基线；下个数据日期再次读取后，可查看场内份额变化。</p>
        ) : null}
        {kind === 'lof' ? (
          <p className="quant-research-caption">间隔设为 0 时仅手动刷新；页面监控需手动启动，离开此工具后停止。</p>
        ) : null}
        {validation ? <Alert type="warning" showIcon title={validation} /> : null}
        {run.isError || save.isError ? (
          <Alert
            type="error"
            showIcon
            title="操作未完成，保留上次成功结果"
            description={run.error?.message ?? save.error?.message}
          />
        ) : null}
        {busy ? (
          <p className="quant-research-loading" role="status">
            正在读取并计算，完成后自动保存到此工具的历史记录。
          </p>
        ) : null}
      </section>
      <section className="quant-research-panel">
        <div className="quant-research-section-heading">
          <h2>{selectedId ? '历史结果' : '最近结果'}</h2>
          <Select
            aria-label="研究历史记录"
            className="quant-workbench-history"
            value={selectedId ?? 'latest'}
            onChange={(v) => setSelectedId(v === 'latest' ? null : v)}
            options={[
              { value: 'latest', label: '最近结果' },
              ...state.history.map((r) => ({
                value: r.id,
                label: `${new Date(r.createdAt).toLocaleString('zh-CN', { hour12: false })} · ${r.asOf}`,
              })),
            ]}
          />
        </div>
        {selectedId && selected.isPending ? (
          <Skeleton active />
        ) : selected.isError ? (
          <Alert type="error" title="历史读取失败" description={selected.error.message} />
        ) : report ? (
          <ResearchResult key={report.id} report={report} />
        ) : (
          <Empty description="尚无研究记录，设置条件后开始运行。" />
        )}
        <p className="quant-research-caption">此工具独立保留最近 20 次成功结果及运行参数，随应用备份保存。</p>
      </section>
    </div>
  );
}

function ResearchResult({ report }: { report: ResearchReport }): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [point, setPoint] = useState<number | null>(null);
  const { message } = App.useApp();
  const rows = report.rows
    .map((row, index) => ({ ...row, _rowKey: String(index) }))
    .filter(
      (row) =>
        !query.trim() ||
        Object.values(row).some((v) =>
          String(v ?? '')
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
        ),
    );
  const columns: ColumnsType<ResearchRow> = report.columns.map((column) => ({
    title: column.label,
    dataIndex: column.key,
    key: column.key,
    width: column.key === 'title' || column.key === 'risk' || column.key === 'redeem' ? 300 : 140,
    sorter:
      column.format === 'number' || column.format === 'percent' || column.format === 'money'
        ? (a, b) => Number(a[column.key] ?? -Infinity) - Number(b[column.key] ?? -Infinity)
        : undefined,
    render: (value: ResearchRow[string]) => {
      if (value === null || value === undefined || value === '') return '—';
      if (column.format === 'link')
        return (
          <Button
            type="link"
            size="small"
            onClick={() => void window.desktop.system.openExternal(String(value)).catch((e) => message.error(String(e)))}
          >
            查看原文
          </Button>
        );
      if (typeof value === 'number')
        return `${value.toLocaleString('zh-CN', { maximumFractionDigits: column.format === 'percent' || column.format === 'money' ? 2 : 4 })}${column.format === 'percent' ? '%' : ''}`;
      if (typeof value === 'boolean') return value ? '是' : '否';
      return String(value);
    },
  }));
  const exportReport = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `quant-${report.kind}-${report.id}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const curve = report.curve;
  const current = curve?.[point ?? curve.length - 1];
  return (
    <>
      <p className="quant-research-caption">
        {report.title} · 数据日期 {report.asOf} · 生成于 {new Date(report.createdAt).toLocaleString('zh-CN', { hour12: false })}
      </p>
      <div className="quant-research-metrics">
        {report.metrics.map((m) => (
          <div key={m.label}>
            <span>{m.label}</span>
            <strong>{m.value}</strong>
          </div>
        ))}
      </div>
      {curve && curve.length > 1 ? (
        <div className="quant-workbench-chart">
          <EquityCurve curve={curve} />
          <label>
            观察日期{' '}
            <input
              aria-label="资金曲线观察日期"
              type="range"
              min={0}
              max={curve.length - 1}
              value={point ?? curve.length - 1}
              onChange={(e) => setPoint(Number(e.target.value))}
            />
          </label>
          <p>
            {current?.date} · 策略 {current?.equity.toFixed(2)} · 买入持有 {current?.benchmark.toFixed(2)}
          </p>
        </div>
      ) : null}
      <div className="quant-research-filters">
        <Input.Search
          aria-label="筛选研究结果"
          placeholder="搜索代码、名称或结果内容"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          allowClear
        />
        <span>
          {rows.length} / {report.rows.length} 条
        </span>
        <Button icon={<DownloadOutlined />} onClick={exportReport}>
          导出结果
        </Button>
      </div>
      <Table<ResearchRow>
        size="small"
        rowKey="_rowKey"
        columns={columns}
        dataSource={rows}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        scroll={{ x: Math.max(800, columns.length * 145) }}
        locale={{ emptyText: <Empty description={query ? '没有匹配结果' : '本次没有符合条件的记录'} /> }}
      />
      {report.warnings.length ? (
        <details className="quant-research-details">
          <summary>数据缺失与排除说明 · {report.warnings.length}</summary>
          {report.warnings.map((warning, i) => (
            <p key={i}>{warning}</p>
          ))}
        </details>
      ) : null}
      <details className="quant-research-details" open>
        <summary>数据口径与本次参数</summary>
        <p>来源：{report.source}</p>
        {report.notes.map((note) => (
          <p key={note}>{note}</p>
        ))}
        <pre>{JSON.stringify(report.request, null, 2)}</pre>
      </details>
    </>
  );
}

function EquityCurve({ curve }: { curve: NonNullable<ResearchReport['curve']> }): React.JSX.Element {
  const values = curve.flatMap((p) => [p.equity, p.benchmark]);
  const min = Math.min(...values),
    max = Math.max(...values),
    span = max - min || 1;
  const path = (key: 'equity' | 'benchmark') =>
    curve
      .map(
        (p, i) =>
          `${i ? 'L' : 'M'}${(60 + (i / (curve.length - 1)) * 820).toFixed(2)},${(225 - ((p[key] - min) / span) * 185).toFixed(2)}`,
      )
      .join(' ');
  return (
    <svg viewBox="0 0 920 270" role="img" aria-label="策略与买入持有资金曲线">
      <title>策略（青色）与买入持有（琥珀色）资金曲线</title>
      <text x="60" y="20">
        策略
      </text>
      <text x="130" y="20" className="quant-curve-benchmark-label">
        买入持有
      </text>
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1="60" x2="880" y1={225 - t * 185} y2={225 - t * 185} className="quant-curve-grid" />
          <text x="0" y={228 - t * 185}>
            {((min + span * t) / 10000).toFixed(1)} 万
          </text>
        </g>
      ))}
      <path d={path('benchmark')} className="quant-curve-benchmark" />
      <path d={path('equity')} className="quant-curve-equity" />
      <text x="60" y="255">
        {curve[0]?.date}
      </text>
      <text x="800" y="255">
        {curve.at(-1)?.date}
      </text>
    </svg>
  );
}
