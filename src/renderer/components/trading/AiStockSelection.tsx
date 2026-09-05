import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Empty, Form, Input, InputNumber, Segmented, Select, Skeleton, Table, Tag } from 'antd';
import { KeyOutlined, SearchOutlined, SaveOutlined } from '@ant-design/icons';
import { Link } from 'react-router';
import {
  SELECTION_PLATFORMS,
  aiSelectionQuerySchema,
  type AiSelectionResult,
  type AiSelectionState,
  type AiSelectionStock,
  type SelectionPlatform,
} from '../../../shared/strategy/ai-selection';
import { buildPositionChartPath } from '../../router/paths';

const stateKey = ['stock-strategy', 'ai-selection'] as const;
const api = (): typeof window.desktop.stockStrategy.aiSelection => window.desktop.stockStrategy.aiSelection;

export function AiStockSelection({
  onUsePool,
  disabled,
}: {
  onUsePool: (result: AiSelectionResult) => Promise<void>;
  disabled: boolean;
}): React.JSX.Element {
  const state = useQuery({ queryKey: stateKey, queryFn: () => api().getState(), retry: false });
  return (
    <section className="stock-strategy-config ai-stock-selection ui-panel" aria-label="平台智能选股">
      {state.isPending ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : state.isError ? (
        <Alert
          type="error"
          showIcon
          title="平台选股配置加载失败"
          description={state.error.message}
          action={<Button onClick={() => void state.refetch()}>重试</Button>}
        />
      ) : (
        <SelectionWorkspace state={state.data} onUsePool={onUsePool} disabled={disabled} />
      )}
    </section>
  );
}

function SelectionWorkspace({
  state,
  onUsePool,
  disabled,
}: {
  state: AiSelectionState;
  onUsePool: (result: AiSelectionResult) => Promise<void>;
  disabled: boolean;
}): React.JSX.Element {
  const client = useQueryClient();
  const { message } = App.useApp();
  const [settings, setSettings] = useState(state.settings);
  const [result, setResult] = useState<AiSelectionResult | null>(null);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const platform = settings.platform;
  const info = SELECTION_PLATFORMS[platform];
  const query = settings.queries[platform];
  const configured = state.configured[platform];
  const snapshot = result?.platform === platform ? result : state.history.find((item) => item.platform === platform);
  const selectedKeys = selected ?? snapshot?.stocks.map((stock) => stock.symbol) ?? [];
  const dirty = JSON.stringify(settings) !== JSON.stringify(state.settings);
  const save = useMutation({
    mutationFn: () => api().saveSettings(settings),
    onSuccess: (value) => {
      client.setQueryData(stateKey, value);
      void message.success('平台与选股条件已保存');
    },
  });
  const run = useMutation({
    mutationFn: async () => {
      const input = aiSelectionQuerySchema.parse({ platform, query, limit: settings.limit });
      const saved = await api().saveSettings(settings);
      client.setQueryData(stateKey, saved);
      return api().query(input);
    },
    onSuccess: (value) => {
      setResult(value);
      setSelected(null);
      void client.invalidateQueries({ queryKey: stateKey });
    },
  });
  const usePool = useMutation({
    mutationFn: async () => {
      if (!snapshot) return;
      await onUsePool({ ...snapshot, stocks: snapshot.stocks.filter((stock) => selectedKeys.includes(stock.symbol)) });
    },
    onSuccess: () => void message.success('已应用到下方策略股票池，可进行日线筛选和固定池回测'),
  });
  const busy = save.isPending || run.isPending || usePool.isPending;
  const choosePlatform = (value: SelectionPlatform): void => {
    setSettings((previous) => ({ ...previous, platform: value }));
    setResult(null);
    setSelected(null);
    setValidation(null);
    run.reset();
    save.reset();
    usePool.reset();
  };
  const history = [
    ...new Map(
      [...(result ? [result] : []), ...state.history].filter((item) => item.platform === platform).map((item) => [item.id, item]),
    ).values(),
  ];
  return (
    <>
      <div className="stock-strategy-section-heading">
        <div>
          <h2>平台智能选股</h2>
          <p>用自然语言筛选沪深股票，再交给下方日线策略检验。</p>
        </div>
        <Segmented
          aria-label="选股平台"
          disabled={busy}
          value={platform}
          onChange={(value) => choosePlatform(value as SelectionPlatform)}
          options={Object.entries(SELECTION_PLATFORMS).map(([value, item]) => ({ value, label: item.name }))}
        />
      </div>
      <KeySettings key={platform} platform={platform} configured={configured} disabled={busy} />
      <Form layout="vertical" className="ai-selection-form" disabled={busy}>
        <Form.Item label={`${info.name} · 选股条件`}>
          <Input.TextArea
            aria-label="平台选股条件"
            value={query}
            maxLength={2000}
            showCount
            autoSize={{ minRows: 2, maxRows: 5 }}
            onChange={(event) => {
              const value = event.target.value;
              setSettings((previous) => ({ ...previous, queries: { ...previous.queries, [platform]: value } }));
              setValidation(null);
            }}
            placeholder="例如：沪深 A 股，非 ST，成交额大于 2 亿，收盘价高于 20 日均线"
          />
        </Form.Item>
        <div className="stock-strategy-actions">
          <label className="ai-selection-limit">
            最多保留{' '}
            <InputNumber
              aria-label="平台选股数量"
              min={1}
              max={60}
              precision={0}
              value={settings.limit}
              onChange={(value) => {
                if (value !== null) setSettings((previous) => ({ ...previous, limit: value }));
              }}
            />{' '}
            只
          </label>
          <Button icon={<SaveOutlined />} disabled={!dirty || busy} loading={save.isPending} onClick={() => save.mutate()}>
            保存条件
          </Button>
          <Button
            type="primary"
            icon={<SearchOutlined />}
            disabled={!configured || busy}
            loading={run.isPending}
            onClick={() => {
              const parsed = aiSelectionQuerySchema.safeParse({ platform, query, limit: settings.limit });
              if (!parsed.success) {
                setValidation(parsed.error.issues.map((issue) => issue.message).join('；'));
                return;
              }
              setValidation(null);
              run.mutate();
            }}
          >
            查询候选股
          </Button>
        </div>
      </Form>
      <p className="stock-strategy-caption">
        每次点击查询会调用所选平台，额度按平台规则计量；保留最近 30 次查询。输入明确的排序条件可控制候选顺序。
      </p>
      {validation || save.error || run.error || usePool.error ? (
        <Alert
          type="error"
          showIcon
          title="操作未完成"
          description={validation ?? save.error?.message ?? run.error?.message ?? usePool.error?.message}
        />
      ) : null}
      {run.isPending ? (
        <Alert type="info" showIcon title={`正在向${info.name}查询`} description="平台正在解析条件，最长约 2 分钟，请稍候。" />
      ) : null}
      {snapshot ? (
        <div className="ai-selection-result">
          <div className="stock-strategy-section-heading">
            <div>
              <h3>平台候选 · {snapshot.stocks.length} 只</h3>
              <p>
                数据来源于{SELECTION_PLATFORMS[snapshot.platform].name} · 查询于{' '}
                {new Date(snapshot.createdAt).toLocaleString('zh-CN')}
                {snapshot.total !== null ? ` · 平台匹配 ${snapshot.total} 条` : ''}
              </p>
            </div>
            <Select
              aria-label="平台历史选股结果"
              value={snapshot.id}
              disabled={busy}
              className="ai-selection-history"
              onChange={(id) => {
                setResult(history.find((item) => item.id === id) ?? null);
                setSelected(null);
              }}
              options={history.map((item) => ({
                value: item.id,
                label: `${new Date(item.createdAt).toLocaleString('zh-CN')} · ${item.stocks.length} 只`,
              }))}
            />
          </div>
          <p className="ai-selection-query">
            <b>本次条件：</b>
            {snapshot.query}
          </p>
          {snapshot.query !== query.trim() || snapshot.limit !== settings.limit ? (
            <Tag color="warning">当前显示上次查询，请重新查询以应用新条件</Tag>
          ) : null}
          <Table<AiSelectionStock>
            rowKey="symbol"
            size="small"
            dataSource={snapshot.stocks}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            scroll={{ x: 840 }}
            locale={{ emptyText: '平台未返回符合条件的沪深股票，可调整条件后重试' }}
            rowSelection={{
              selectedRowKeys: selectedKeys,
              onChange: (keys) => setSelected(keys.map(String)),
              getCheckboxProps: () => ({ disabled: busy }),
            }}
            columns={[
              {
                title: '标的',
                key: 'stock',
                width: 150,
                render: (_, stock) => (
                  <span>
                    <Link to={buildPositionChartPath(stock.symbol)}>{stock.name}</Link>
                    <small className="ui-cell-secondary">{stock.symbol}</small>
                  </span>
                ),
              },
              {
                title: '平台返回指标（以字段日期为准）',
                key: 'metrics',
                render: (_, stock) => (
                  <div className="ai-selection-metrics">
                    {stock.metrics.length ? (
                      stock.metrics.map((metric) => (
                        <span key={metric.label}>
                          <b>{metric.label}</b> {metric.value}
                        </span>
                      ))
                    ) : (
                      <span>平台未返回额外指标</span>
                    )}
                  </div>
                ),
              },
            ]}
          />
          <div className="stock-strategy-actions">
            <Button
              type="primary"
              className="ui-button-secondary"
              disabled={!selectedKeys.length || busy || disabled}
              loading={usePool.isPending}
              onClick={() => usePool.mutate()}
            >
              将勾选的 {selectedKeys.length} 只应用到策略股票池
            </Button>
            <span className="stock-strategy-caption">导入后可在下方筛选和回测</span>
          </div>
          {snapshot.warnings.map((warning) => (
            <p className="stock-strategy-caption" key={warning}>
              {warning}
            </p>
          ))}
          {snapshot.explanation ? (
            <details className="stock-strategy-notes">
              <summary>查看平台返回说明</summary>
              <p className="ai-selection-explanation">{snapshot.explanation}</p>
            </details>
          ) : null}
        </div>
      ) : !run.isPending ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={configured ? '保存筛选条件，生成这次的候选名单' : '先配置当前平台密钥，再开始选股'}
        />
      ) : null}
    </>
  );
}

function KeySettings({
  platform,
  configured,
  disabled,
}: {
  platform: SelectionPlatform;
  configured: boolean;
  disabled: boolean;
}): React.JSX.Element {
  const [key, setKey] = useState('');
  const client = useQueryClient();
  const { message } = App.useApp();
  const info = SELECTION_PLATFORMS[platform];
  const save = useMutation({
    mutationFn: () => api().saveKey({ platform, apiKey: key }),
    onSuccess: (state) => {
      setKey('');
      client.setQueryData(stateKey, state);
      void message.success('密钥已加密保存，查询候选股可验证接口权限');
    },
  });
  const clear = useMutation({
    mutationFn: () => api().clearKey(platform),
    onSuccess: (state) => {
      setKey('');
      client.setQueryData(stateKey, state);
      void message.success('当前平台密钥已移除');
    },
  });
  const busy = disabled || save.isPending || clear.isPending;
  return (
    <details className="ai-selection-credentials" open={!configured || undefined}>
      <summary>
        <KeyOutlined /> 平台连接 <Tag color={configured ? 'success' : 'default'}>{configured ? '密钥已保存' : '未配置密钥'}</Tag>
      </summary>
      <div className="ai-selection-key-row">
        <Input.Password
          aria-label={`${info.name} API Key`}
          value={key}
          onChange={(event) => setKey(event.target.value)}
          disabled={busy}
          autoComplete="off"
          maxLength={4096}
          placeholder={configured ? '输入新密钥可替换' : '粘贴当前平台的专属 API Key'}
        />
        <Button disabled={!key.trim() || busy} loading={save.isPending} onClick={() => save.mutate()}>
          保存密钥
        </Button>
        {configured ? (
          <Button disabled={busy} loading={clear.isPending} onClick={() => clear.mutate()}>
            移除密钥
          </Button>
        ) : null}
        <a
          href={info.keyUrl}
          onClick={(event) => {
            event.preventDefault();
            void window.desktop.system.openExternal(info.keyUrl).catch((error: unknown) => {
              void message.error(error instanceof Error ? error.message : '无法打开浏览器，请稍后重试');
            });
          }}
        >
          获取 API Key
        </a>
      </div>
      <p className="stock-strategy-caption">
        {platform === 'wencai'
          ? '问财 SkillHub → 登录 → 任一官方 Skill → 安装方式 / Agent 用户 → IWENCAI_API_KEY。此处填写 SkillHub 密钥，不是 iFind 令牌或网页 Cookie。'
          : '妙想官网 → 登录 → 技能·MCP → 查看 API Key。需有智能选股权限和可用额度。'}{' '}
        密钥由系统安全存储加密，仅保存在本机。
      </p>
      {save.error || clear.error ? (
        <Alert type="error" showIcon title="密钥配置失败" description={save.error?.message ?? clear.error?.message} />
      ) : null}
    </details>
  );
}
