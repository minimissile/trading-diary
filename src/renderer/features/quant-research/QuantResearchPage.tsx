import { useState } from 'react';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Checkbox, Empty, Form, Input, InputNumber, Select, Skeleton, Table, Tabs, Tag } from 'antd';
import { ExperimentOutlined, PlayCircleOutlined, SaveOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { QUANT_RULES } from '../../../shared/quant-research/catalog';
import { quantSettingsSchema } from '../../../shared/quant-research/schemas';
import type { QuantResearchState, QuantRun, QuantRunSummary, QuantSettings } from '../../../shared/quant-research/types';
import { QuantSignals } from './QuantSignals';
import './quant-research.css';

const stateKey = ['quant-research', 'state'] as const;
const scanKey = ['quant-research', 'scan'] as const;
const poolNames = { personal: '我的自选（沪深 A 股）', custom: '独立自定义股票池' };
const dateTime = (value: string): string => new Date(value).toLocaleString('zh-CN', { hour12: false });

export default function QuantResearchPage(): React.JSX.Element {
  const state = useQuery({ queryKey: stateKey, queryFn: () => window.desktop.quantResearch.getState(), retry: false });
  return (
    <div className="quant-research-page">
      <header className="quant-research-heading">
        <div>
          <span className="quant-research-kicker">市场观察 · 规则扫描</span>
          <h1>量化研究</h1>
          <p>从价格、量能与 K 线形态中提取可复查的信号。</p>
        </div>
        <Tag color="processing" icon={<ExperimentOutlined />}>
          日线研究
        </Tag>
      </header>
      {state.isPending ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : state.isError ? (
        <Alert
          type="error"
          showIcon
          title="研究工作区加载失败"
          description={state.error.message}
          action={<Button onClick={() => void state.refetch()}>重试</Button>}
        />
      ) : (
        <QuantWorkspace state={state.data} />
      )}
    </div>
  );
}

function QuantWorkspace({ state }: { state: QuantResearchState }): React.JSX.Element {
  const client = useQueryClient();
  const { message } = App.useApp();
  const [draft, setDraft] = useState(state.settings);
  const [symbols, setSymbols] = useState(state.settings.symbols.join(', '));
  const [validation, setValidation] = useState<string | null>(null);
  const [tab, setTab] = useState('signals');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const scanning = useIsMutating({ mutationKey: scanKey }) > 0;
  const selected = useQuery({
    queryKey: ['quant-research', 'run', selectedId],
    queryFn: () => window.desktop.quantResearch.getRun(selectedId!),
    enabled: selectedId !== null && selectedId !== state.latest?.id,
    retry: false,
  });
  const scan = useMutation({
    mutationKey: scanKey,
    mutationFn: (settings: QuantSettings) => window.desktop.quantResearch.scan(settings),
    onSuccess: (run) => {
      client.setQueryData<QuantResearchState>(stateKey, (old) => ({
        settings: run.settings,
        latest: run,
        history: [summaryOf(run), ...(old?.history ?? []).filter((item) => item.id !== run.id)].slice(0, 20),
      }));
      setSelectedId(null);
      setTab('signals');
      void message.success(`扫描完成：${run.matchedCount} 只股票，${run.signalCount} 条信号`);
    },
  });
  const save = useMutation({
    mutationFn: (settings: QuantSettings) => window.desktop.quantResearch.saveSettings(settings),
    onSuccess: (settings) => {
      client.setQueryData<QuantResearchState>(stateKey, (old) => (old ? { ...old, settings } : old));
      void message.success('研究配置已保存');
    },
  });
  const busy = scanning || save.isPending;
  const result = selectedId && selectedId !== state.latest?.id ? selected.data : state.latest;
  const loadingHistory = selectedId !== null && selectedId !== state.latest?.id && selected.isFetching;
  const requestSettings = (): QuantSettings | null => {
    const parsed = quantSettingsSchema.safeParse({
      ...draft,
      symbols: [...new Set(symbols.split(/[\s,，;；]+/u).filter(Boolean))],
    });
    if (!parsed.success) {
      setValidation(parsed.error.issues[0]?.message ?? '请检查扫描条件');
      return null;
    }
    setValidation(null);
    return parsed.data;
  };
  const update = <K extends keyof QuantSettings>(key: K, value: QuantSettings[K]): void => {
    setDraft((current) => ({ ...current, [key]: value }));
    setValidation(null);
  };
  const historyColumns: ColumnsType<QuantRunSummary> = [
    { title: '扫描时间', dataIndex: 'createdAt', render: dateTime },
    { title: '信号窗口', key: 'range', render: (_, row) => `${row.startDate} — ${row.endDate}` },
    { title: '有效股票', dataIndex: 'scannedCount', align: 'right' },
    { title: '命中股票', dataIndex: 'matchedCount', align: 'right' },
    { title: '信号', dataIndex: 'signalCount', align: 'right' },
    { title: '排除', dataIndex: 'excludedCount', align: 'right' },
    {
      title: '操作',
      key: 'action',
      render: (_, row) => (
        <Button
          size="small"
          onClick={() => {
            setSelectedId(row.id);
            setTab('signals');
          }}
        >
          查看记录
        </Button>
      ),
    },
  ];

  return (
    <>
      <section className="quant-research-panel" aria-label="扫描条件">
        <div className="quant-research-section-heading">
          <div>
            <h2>扫描条件</h2>
            <p>最多 60 只沪深股票；每次扫描自动保存条件与结果。</p>
          </div>
          <div className="quant-research-actions">
            <Button
              icon={<SaveOutlined />}
              disabled={busy}
              onClick={() => {
                const settings = requestSettings();
                if (settings) save.mutate(settings);
              }}
            >
              保存配置
            </Button>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              loading={scanning}
              disabled={busy}
              onClick={() => {
                const settings = requestSettings();
                if (settings) scan.mutate(settings);
              }}
            >
              开始扫描
            </Button>
          </div>
        </div>
        <Form layout="vertical" disabled={busy} className="quant-research-form">
          <Form.Item label="股票范围">
            <Select
              aria-label="股票范围"
              value={draft.poolId}
              onChange={(value) => update('poolId', value)}
              options={Object.entries(poolNames).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          <Form.Item label="新高 / 新低周期">
            <InputNumber
              aria-label="新高新低周期"
              min={5}
              max={120}
              precision={0}
              suffix="日"
              value={draft.lookback}
              onChange={(value) => {
                if (value !== null) update('lookback', value);
              }}
            />
          </Form.Item>
          <Form.Item label="均线周期">
            <InputNumber
              aria-label="均线周期"
              min={2}
              max={120}
              precision={0}
              suffix="日"
              value={draft.maPeriod}
              onChange={(value) => {
                if (value !== null) update('maPeriod', value);
              }}
            />
          </Form.Item>
          <Form.Item label="放量阈值">
            <InputNumber
              aria-label="放量阈值"
              min={1}
              max={10}
              step={0.5}
              suffix="倍"
              value={draft.volumeMultiple}
              onChange={(value) => {
                if (value !== null) update('volumeMultiple', value);
              }}
            />
          </Form.Item>
          <Form.Item label="最近交易日">
            <InputNumber
              aria-label="最近交易日"
              min={1}
              max={20}
              precision={0}
              suffix="日"
              value={draft.recentDays}
              onChange={(value) => {
                if (value !== null) update('recentDays', value);
              }}
            />
          </Form.Item>
        </Form>
        {draft.poolId === 'custom' ? (
          <label className="quant-research-symbols">
            股票代码（空格或逗号分隔）
            <Input.TextArea
              aria-label="自定义股票代码"
              disabled={busy}
              value={symbols}
              onChange={(event) => setSymbols(event.target.value)}
              placeholder="输入六位沪深股票代码"
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          </label>
        ) : null}
        <div className="quant-research-rule-groups">
          {(['technical', 'pattern'] as const).map((category) => (
            <fieldset key={category} disabled={busy}>
              <legend>{category === 'technical' ? '价格与量能' : 'K 线形态'}</legend>
              <Checkbox.Group
                value={draft.rules.filter((id) => QUANT_RULES.some((rule) => rule.id === id && rule.category === category))}
                onChange={(values) =>
                  update('rules', [
                    ...draft.rules.filter((id) => QUANT_RULES.some((rule) => rule.id === id && rule.category !== category)),
                    ...QUANT_RULES.filter((rule) => values.includes(rule.id)).map((rule) => rule.id),
                  ])
                }
                options={QUANT_RULES.filter((rule) => rule.category === category).map((rule) => ({
                  label: rule.name,
                  value: rule.id,
                }))}
                disabled={busy}
              />
            </fieldset>
          ))}
        </div>
        {validation ? <Alert type="warning" showIcon title={validation} /> : null}
        {scan.isError || save.isError ? (
          <Alert type="error" showIcon title="操作未完成" description={scan.error?.message ?? save.error?.message} />
        ) : null}
        {scanning ? (
          <p className="quant-research-loading" role="status">
            正在读取完整日线并扫描，最多约两分钟。完成后结果会保存在历史记录中。
          </p>
        ) : null}
        <p className="quant-research-caption">
          手动运行 · 15:30 前使用上一完整交易日 · 形态描述历史特征，不代表买卖指令或上涨概率。
        </p>
      </section>

      <section className="quant-research-panel" aria-label="研究结果">
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: 'signals',
              label: '信号扫描',
              children: (
                <>
                  <div className="quant-research-section-heading">
                    <div>
                      <h2>{selectedId ? '历史扫描结果' : '最近扫描结果'}</h2>
                      <p>结果保留执行当时的规则、股票池与数据日期。</p>
                    </div>
                    {selectedId ? <Button onClick={() => setSelectedId(null)}>返回最近结果</Button> : null}
                  </div>
                  {loadingHistory ? (
                    <Skeleton active paragraph={{ rows: 5 }} />
                  ) : selectedId && selectedId !== state.latest?.id && selected.isError ? (
                    <Alert
                      type="error"
                      showIcon
                      title="历史记录加载失败"
                      description={selected.error.message}
                      action={<Button onClick={() => void selected.refetch()}>重试</Button>}
                    />
                  ) : result ? (
                    <QuantSignals key={result.id} run={result} />
                  ) : (
                    <Empty description="尚无扫描记录。选择规则与股票范围后开始扫描。" />
                  )}
                </>
              ),
            },
            {
              key: 'history',
              label: `扫描记录 · ${state.history.length}`,
              children: (
                <>
                  <p className="quant-research-caption">保留最近 20 次成功扫描，包含无信号的结果；配置与结果随应用备份保存。</p>
                  <Table
                    rowKey="id"
                    dataSource={state.history}
                    columns={historyColumns}
                    size="small"
                    pagination={{ pageSize: 10, showSizeChanger: false }}
                    scroll={{ x: 820 }}
                    locale={{ emptyText: <Empty description="还没有历史记录" /> }}
                  />
                </>
              ),
            },
            {
              key: 'rules',
              label: '规则说明',
              children: (
                <div className="quant-research-definitions">
                  {QUANT_RULES.map((rule) => (
                    <article key={rule.id}>
                      <strong>{rule.name}</strong>
                      <p>{rule.description}</p>
                    </article>
                  ))}
                  <p className="quant-research-caption">
                    规则参考 Rockyzsu/stock 的选股与形态研究，并以本页定义为准。不同工具的识别结果可能不同，请结合命中依据复查。
                  </p>
                </div>
              ),
            },
          ]}
        />
      </section>
    </>
  );
}

function summaryOf(run: QuantRun): QuantRunSummary {
  const { id, createdAt, startDate, endDate, scannedCount, matchedCount, signalCount, excludedCount } = run;
  return { id, createdAt, startDate, endDate, scannedCount, matchedCount, signalCount, excludedCount };
}
