import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Segmented,
  Skeleton,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, ReloadOutlined, ScanOutlined } from '@ant-design/icons';
import type {
  CreateLofArbitrageRuleInput,
  LofArbitrageAlertEvent,
  LofArbitrageDirection,
  LofArbitrageRule,
  LofArbitrageSnapshot,
  LofWatchItem,
} from '../../shared/lof-arbitrage/types';
import { SymbolSearchInput } from '../components/trading/SymbolSearchInput';
import { priceListPresetForKind } from '../../shared/format/display-presets';
import { ValueDisplay } from '../lib/trading-format';
import { summarizeActionHint } from '../../shared/lof-arbitrage/action-hint';

type ViewMode = 'watchlist' | 'market';

function subscriptionTag(status: LofArbitrageSnapshot['subscriptionStatus'], label: string | null): React.ReactNode {
  if (status === 'open') return <Tag color="green">{label ?? '开放申购'}</Tag>;
  if (status === 'paused') return <Tag color="orange">{label ?? '暂停申购'}</Tag>;
  if (status === 'limited') return <Tag color="gold">{label ?? '限购'}</Tag>;
  return <Tag>{label ?? '未知'}</Tag>;
}

function premiumTone(rate: number | null): string {
  if (rate === null) return '';
  if (rate >= 0.02) return 'td-value--profit';
  if (rate <= -0.01) return 'td-value--loss';
  return '';
}

export function LofArbitragePage(): React.JSX.Element {
  const { message } = App.useApp();
  const [viewMode, setViewMode] = useState<ViewMode>('watchlist');
  const [watchItems, setWatchItems] = useState<LofWatchItem[]>([]);
  const [snapshots, setSnapshots] = useState<LofArbitrageSnapshot[]>([]);
  const [marketSnapshots, setMarketSnapshots] = useState<LofArbitrageSnapshot[]>([]);
  const [rules, setRules] = useState<LofArbitrageRule[]>([]);
  const [events, setEvents] = useState<LofArbitrageAlertEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [detail, setDetail] = useState<LofArbitrageSnapshot | null>(null);
  const [addWatchOpen, setAddWatchOpen] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [addForm] = Form.useForm<{ symbol: string; notes?: string }>();
  const [ruleForm] = Form.useForm<CreateLofArbitrageRuleInput & { thresholdPercent: number }>();

  const loadMeta = useCallback(async (): Promise<void> => {
    const [items, nextRules, nextEvents] = await Promise.all([
      window.desktop.lofArbitrage.listWatchItems(),
      window.desktop.lofArbitrage.listRules(),
      window.desktop.lofArbitrage.listEvents(30),
    ]);
    setWatchItems(items);
    setRules(nextRules);
    setEvents(nextEvents);
  }, []);

  const refreshWatchlist = useCallback(
    async (silent = false): Promise<void> => {
      if (!silent) setRefreshing(true);
      try {
        const result = await window.desktop.lofArbitrage.refreshMonitor();
        setWatchItems(result.watchItems);
        setSnapshots(result.snapshots);
        setRules(result.rules);
      } catch (reason) {
        void message.error(reason instanceof Error ? reason.message : '监控数据刷新失败');
      } finally {
        setRefreshing(false);
      }
    },
    [message],
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await loadMeta();
        if (active) await refreshWatchlist(true);
      } catch (reason) {
        if (active) void message.error(reason instanceof Error ? reason.message : 'LOF 套利模块加载失败');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [loadMeta, message, refreshWatchlist]);

  const tableData = viewMode === 'watchlist' ? snapshots : marketSnapshots;

  const columns: ColumnsType<LofArbitrageSnapshot> = useMemo(
    () => [
      {
        title: '代码',
        dataIndex: 'symbol',
        width: 88,
        render: (value: string) => <span className="td-mono">{value}</span>,
      },
      { title: '名称', dataIndex: 'name', ellipsis: true },
      {
        title: '场内价',
        dataIndex: 'marketPrice',
        align: 'right',
        render: (value: number | null) => <ValueDisplay kind={priceListPresetForKind('lof')} value={value} />,
      },
      {
        title: '参考净值',
        dataIndex: 'referenceNav',
        align: 'right',
        render: (value: number | null, row) => (
          <Tooltip title={row.navDate ? `公布日 ${row.navDate}${row.referenceNavSource === 'estimated' ? ' · 盘中估值' : ''}` : undefined}>
            <ValueDisplay kind={priceListPresetForKind('lof')} value={value} />
          </Tooltip>
        ),
      },
      {
        title: '溢价率',
        dataIndex: 'premiumRate',
        align: 'right',
        sorter: (a, b) => (a.premiumRate ?? 0) - (b.premiumRate ?? 0),
        defaultSortOrder: 'descend',
        render: (value: number | null) => (
          <span className={premiumTone(value)}>
            <ValueDisplay kind="percent" value={value} />
          </span>
        ),
      },
      {
        title: '成交额',
        dataIndex: 'amount',
        align: 'right',
        render: (value: number | null) => <ValueDisplay kind="currency" value={value} />,
      },
      {
        title: '申购',
        key: 'subscription',
        width: 110,
        render: (_, row) => subscriptionTag(row.subscriptionStatus, row.subscriptionStatusLabel),
      },
      {
        title: '建议',
        key: 'hint',
        ellipsis: true,
        render: (_, row) => summarizeActionHint(row.premiumRate, row.feasiblePaths, row.recommendedPath),
      },
      {
        title: '',
        key: 'actions',
        width: 72,
        render: (_, row) => (
          <Button type="link" size="small" onClick={() => setDetail(row)}>
            详情
          </Button>
        ),
      },
    ],
    [],
  );

  const scanMarket = async (): Promise<void> => {
    setScanning(true);
    try {
      const result = await window.desktop.lofArbitrage.scanMarket(120);
      setMarketSnapshots(result.snapshots);
      setViewMode('market');
      void message.success(`已扫描 ${result.snapshots.length} 只 LOF`);
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '全市场扫描失败');
    } finally {
      setScanning(false);
    }
  };

  const submitWatch = async (): Promise<void> => {
    const values = await addForm.validateFields();
    try {
      await window.desktop.lofArbitrage.addWatchItem(values.symbol.trim().toUpperCase(), values.notes?.trim() || null);
      setAddWatchOpen(false);
      addForm.resetFields();
      await loadMeta();
      await refreshWatchlist(true);
      void message.success('已加入监控');
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '添加监控失败');
    }
  };

  const submitRule = async (): Promise<void> => {
    const values = await ruleForm.validateFields();
    const input: CreateLofArbitrageRuleInput = {
      symbol: values.symbol?.trim().toUpperCase() || null,
      direction: values.direction,
      thresholdRate: values.thresholdPercent / 100,
      minAmount: values.minAmount ?? null,
      requireSubscriptionOpen: values.requireSubscriptionOpen ?? true,
      minNetSpread: values.minNetSpread != null ? values.minNetSpread / 100 : null,
    };
    try {
      await window.desktop.lofArbitrage.createRule(input);
      setRuleOpen(false);
      ruleForm.resetFields();
      await loadMeta();
      void message.success('提醒规则已创建');
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '创建规则失败');
    }
  };

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h1>LOF 套利监控</h1>
          <p className="page-subtitle">
            交易时段自动扫描全市场 LOF · 仅在申购开放、扣费后仍有净空间且路径可行时提醒 · 不构成投资建议
          </p>
        </div>
        <Space wrap>
          <Button icon={<PlusOutlined />} onClick={() => setAddWatchOpen(true)}>
            添加监控
          </Button>
          <Button icon={<PlusOutlined />} onClick={() => setRuleOpen(true)}>
            折溢价提醒
          </Button>
          <Button icon={<ScanOutlined />} loading={scanning} onClick={() => void scanMarket()}>
            全市场扫描
          </Button>
          <Button icon={<ReloadOutlined />} loading={refreshing} onClick={() => void refreshWatchlist()}>
            刷新
          </Button>
        </Space>
      </header>

      {events.some((event) => !event.userAction) ? (
        <Alert
          type="warning"
          showIcon
          message={`${events.filter((event) => !event.userAction).length} 条 LOF 套利提醒待处理`}
          action={
            <Button size="small" onClick={() => void loadMeta()}>
              刷新事件
            </Button>
          }
        />
      ) : null}

      <Segmented
        value={viewMode}
        onChange={(value) => setViewMode(value as ViewMode)}
        options={[
          { label: `监控池 (${watchItems.length})`, value: 'watchlist' },
          { label: `全市场 (${marketSnapshots.length})`, value: 'market' },
        ]}
      />

      {loading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <Table
          rowKey="symbol"
          columns={columns}
          dataSource={tableData}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          locale={{
            emptyText:
              viewMode === 'watchlist'
                ? '暂无监控项。全市场可执行套利由后台自动扫描；此处可额外关注个别 LOF，或依赖持仓自动纳入。'
                : '点击「全市场扫描」立即查看当前折溢价排行（含暂不可执行的标的）。',
          }}
        />
      )}

      {rules.length > 0 ? (
        <section className="panel-card">
          <h3>活跃提醒规则</h3>
          <Space wrap>
            {rules.map((rule) => (
              <Tag key={rule.id} color={rule.status === 'active' ? 'blue' : 'default'}>
                {rule.symbol ?? '全市场'} · {(rule.thresholdRate * 100).toFixed(1)}% · {rule.direction}
              </Tag>
            ))}
          </Space>
        </section>
      ) : null}

      <Drawer
        title={detail ? `${detail.symbol} ${detail.name}` : '详情'}
        open={detail !== null}
        width={480}
        onClose={() => setDetail(null)}
      >
        {detail ? (
          <div className="stack-sm">
            <dl className="detail-dl">
              <dt>场内价</dt>
              <dd>
                <ValueDisplay kind={priceListPresetForKind('lof')} value={detail.marketPrice} />
              </dd>
              <dt>参考净值</dt>
              <dd>
                <ValueDisplay kind={priceListPresetForKind('lof')} value={detail.referenceNav} />
                {detail.navDate ? ` (${detail.navDate})` : null}
              </dd>
              <dt>溢价率</dt>
              <dd>
                <ValueDisplay kind="percent" value={detail.premiumRate} />
              </dd>
              <dt>申购 / 赎回</dt>
              <dd>
                {subscriptionTag(detail.subscriptionStatus, detail.subscriptionStatusLabel)}{' '}
                {detail.redemptionStatusLabel ?? '—'}
              </dd>
            </dl>

            <h4>可行路径</h4>
            {detail.feasiblePaths.map((path) => (
              <div key={path.kind} className="panel-card panel-card--compact">
                <strong>{path.label}</strong>
                {path.feasible ? <Tag color="green">可行</Tag> : <Tag>不可行</Tag>}
                {path.estimatedNetSpread != null ? (
                  <div>
                    扣费后净空间：<ValueDisplay kind="percent" value={path.estimatedNetSpread} />
                  </div>
                ) : null}
                {path.blockers.length > 0 ? (
                  <ul>
                    {path.blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                ) : null}
                <ol>
                  {path.milestones.map((step) => (
                    <li key={`${step.dayOffset}-${step.action}`}>
                      {step.label}：{step.action}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        ) : null}
      </Drawer>

      <Modal title="添加 LOF 监控" open={addWatchOpen} onCancel={() => setAddWatchOpen(false)} onOk={() => void submitWatch()}>
        <Form form={addForm} layout="vertical">
          <Form.Item name="symbol" label="基金代码" rules={[{ required: true, message: '请输入 LOF 代码' }]}>
            <SymbolSearchInput placeholder="如 161226" />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input placeholder="可选" maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="折溢价提醒" open={ruleOpen} onCancel={() => setRuleOpen(false)} onOk={() => void submitRule()}>
        <Form
          form={ruleForm}
          layout="vertical"
          initialValues={{
            direction: 'both' as LofArbitrageDirection,
            thresholdPercent: 2,
            requireSubscriptionOpen: true,
            minAmount: 100_000,
          }}
        >
          <Form.Item name="symbol" label="标的（留空 = 全市场自动扫描）">
            <SymbolSearchInput placeholder="留空则扫描全部 LOF，仅提醒可执行套利" />
          </Form.Item>
          <Form.Item name="direction" label="方向" rules={[{ required: true }]}>
            <Radio.Group>
              <Radio value="premium">溢价</Radio>
              <Radio value="discount">折价</Radio>
              <Radio value="both">双向</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="thresholdPercent" label="阈值 (%)" rules={[{ required: true }]}>
            <InputNumber min={0.1} max={50} step={0.1} style={{ width: '100%' }} addonAfter="%" />
          </Form.Item>
          <Form.Item name="minAmount" label="最低成交额 (元)">
            <InputNumber min={0} step={10000} style={{ width: '100%' }} placeholder="可选" />
          </Form.Item>
          <Form.Item name="requireSubscriptionOpen" label="溢价时要求申购开放" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
