import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useMemo, useState } from 'react';
import { Alert, App, Button, Empty, Form, Input, InputNumber, Modal, Radio, Segmented, Skeleton, Space, Tag } from 'antd';
import type { CreateTradeAlertInput, TradeAlert, TradeAlertCondition, TradeAlertStatus } from '../../shared/api.types';
import {
  alertRoleLabels,
  alertStatusColors,
  alertStatusLabels,
  formatAlertCondition,
  formatDateTime,
  formatPrice,
} from '../lib/trading-format';
import { invalidateWorkspaceData, useAlertsDashboardQuery } from '../lib/queries';
import { SymbolSearchInput } from '../components/trading/SymbolSearchInput';

interface QuoteFormValues {
  symbol: string;
  price: number;
}

type AlertFilter = 'open' | 'triggered' | 'history' | 'events';

export function AlertsPage(): React.JSX.Element {
  const { message } = App.useApp();
  const [quoteForm] = Form.useForm<QuoteFormValues>();
  const [createForm] = Form.useForm<CreateTradeAlertInput>();
  const { alerts, events, isLoading: loading, refetch } = useAlertsDashboardQuery();
  const [filter, setFilter] = useState<AlertFilter>('triggered');
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastEvaluation, setLastEvaluation] = useState<string | null>(null);

  const activeCount = alerts.filter((alert) => alert.status === 'active').length;
  const triggeredCount = alerts.filter((alert) => alert.status === 'triggered').length;
  const historyCount = alerts.filter((alert) => alert.status === 'completed' || alert.status === 'disabled').length;
  const visibleAlerts = useMemo(
    () =>
      alerts.filter((alert) => {
        const matchesStatus =
          filter === 'open'
            ? alert.status === 'active'
            : filter === 'triggered'
              ? alert.status === 'triggered'
              : alert.status === 'completed' || alert.status === 'disabled';
        return matchesStatus && `${alert.symbol} ${alert.title}`.toLowerCase().includes(query.trim().toLowerCase());
      }),
    [alerts, filter, query],
  );
  const visibleEvents = useMemo(
    () => events.filter((event) => `${event.symbol} ${event.title}`.toLowerCase().includes(query.trim().toLowerCase())),
    [events, query],
  );

  const evaluate = async (values: QuoteFormValues): Promise<void> => {
    setEvaluating(true);
    try {
      const result = await window.desktop.alerts.evaluatePrice(values.symbol.trim().toUpperCase(), values.price);
      await invalidateWorkspaceData();
      await refetch();
      if (result.evaluatedCount === 0) {
        setLastEvaluation(`${result.symbol} 当前没有处于监控中的提醒。`);
      } else if (result.newlyTriggered.length === 0) {
        setLastEvaluation(`${result.symbol} 已检查 ${result.evaluatedCount} 条提醒，当前价格尚未满足触发条件。`);
      } else {
        setLastEvaluation(`${result.symbol} 新触发 ${result.newlyTriggered.length} 条提醒，系统通知已发送。`);
      }
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '行情检查失败');
    } finally {
      setEvaluating(false);
    }
  };

  const create = async (): Promise<void> => {
    const values = await createForm.validateFields();
    setSaving(true);
    try {
      await window.desktop.alerts.create({ ...values, symbol: values.symbol.trim().toUpperCase() });
      createForm.resetFields();
      setCreateOpen(false);
      await invalidateWorkspaceData();
      await refetch();
      void message.success('自定义价格提醒已开始监控');
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '提醒创建失败');
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (alert: TradeAlert, status: TradeAlertStatus): Promise<void> => {
    try {
      await window.desktop.alerts.setStatus(alert.id, status);
      await invalidateWorkspaceData();
      await refetch();
      void message.success(status === 'active' ? '提醒已重新启用' : status === 'completed' ? '提醒已处理' : '提醒已停用');
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '提醒更新失败');
    }
  };

  return (
    <main className="workspace-page alerts-page">
      <header className="page-header">
        <div>
          <p className="page-kicker">ALERT ENGINE</p>
          <h1>提醒中心</h1>
          <p className="page-intro">提醒执行你的计划，不替你做投资决策。</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          新建价格提醒
        </Button>
      </header>

      <section className="alerts-overview" aria-label="提醒状态概览">
        <article>
          <small>待处理</small>
          <strong>{loading ? '—' : triggeredCount}</strong>
          <span>已满足触发条件，等待确认</span>
        </article>
        <article>
          <small>监控中</small>
          <strong>{loading ? '—' : activeCount}</strong>
          <span>按设定的价格条件持续观察</span>
        </article>
        <article>
          <small>触发记录</small>
          <strong>{loading ? '—' : events.length}</strong>
          <span>保留每次触发时的价格与时间</span>
        </article>
      </section>
      <details className="alerts-manual-check">
        <summary>手动检查价格</summary>
        <p>输入标的与价格，检查当前监控条件。满足条件时会触发提醒并发送系统通知。</p>
        <Form<QuoteFormValues>
          className="quote-form"
          form={quoteForm}
          layout="inline"
          onFinish={(values) => void evaluate(values)}
        >
          <Form.Item label="标的" name="symbol" rules={[{ required: true, message: '请输入代码' }]}>
            <SymbolSearchInput placeholder="标的代码" maxLength={32} resolveOnBlur={false} />
          </Form.Item>
          <Form.Item label="最新价" name="price" rules={[{ required: true, message: '请输入最新价' }]}>
            <InputNumber min={0.0001} precision={4} placeholder="最新价" />
          </Form.Item>
          <Button htmlType="submit" type="primary" loading={evaluating}>
            检查并触发
          </Button>
        </Form>
      </details>

      {lastEvaluation ? <Alert className="evaluation-result" type="info" title={lastEvaluation} showIcon closable /> : null}

      <div className="alerts-toolbar">
        <Segmented<AlertFilter>
          options={[
            { label: `待处理 ${triggeredCount}`, value: 'triggered' },
            { label: `监控中 ${activeCount}`, value: 'open' },
            { label: `历史 ${historyCount}`, value: 'history' },
            { label: `触发记录 ${events.length}`, value: 'events' },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <Input
          className="alerts-search"
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索代码或提醒名称"
          aria-label="搜索提醒"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {loading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : filter === 'events' ? (
        visibleEvents.length === 0 ? (
          <div className="empty-panel">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={query.trim() ? '未找到匹配记录' : '还没有触发记录'} />
          </div>
        ) : (
          <div className="alert-event-list">
            {visibleEvents.map((event) => (
              <article className="alert-event-card" key={event.id}>
                <div className="alert-card-title">
                  <strong>{event.symbol}</strong>
                  <span>{event.title}</span>
                </div>
                <p>
                  {formatAlertCondition(event.condition, event.targetPrice)} · 触发价 {formatPrice(event.triggerPrice)}
                </p>
                <div className="alert-card-meta">
                  <span>{formatDateTime(event.triggeredAt)}</span>
                  <span>{event.userAction ? `处理：${event.userAction}` : '待处理'}</span>
                </div>
              </article>
            ))}
          </div>
        )
      ) : visibleAlerts.length === 0 ? (
        <div className="empty-panel">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              query.trim()
                ? '未找到匹配提醒'
                : filter === 'triggered'
                  ? '暂无待处理提醒'
                  : filter === 'open'
                    ? '暂无监控中的提醒'
                    : '暂无处理历史'
            }
          />
        </div>
      ) : (
        <div className="alert-list">
          {visibleAlerts.map((tradeAlert) => (
            <article className={`alert-card alert-card--${tradeAlert.status}`} key={tradeAlert.id}>
              <div className="alert-card-main">
                <div className="alert-card-title">
                  <strong>{tradeAlert.symbol}</strong>
                  <span>{tradeAlert.title}</span>
                  <Tag>{alertRoleLabels[tradeAlert.role]}</Tag>
                  <Tag color={alertStatusColors[tradeAlert.status]}>{alertStatusLabels[tradeAlert.status]}</Tag>
                </div>
                <p>{formatAlertCondition(tradeAlert.condition, tradeAlert.targetPrice)}</p>
                <div className="alert-card-meta">
                  <span>最近检查：{tradeAlert.lastPrice === null ? '尚未检查' : formatPrice(tradeAlert.lastPrice)}</span>
                  <span>
                    {tradeAlert.triggeredAt === null
                      ? `创建于 ${formatDateTime(tradeAlert.createdAt)}`
                      : `触发于 ${formatDateTime(tradeAlert.triggeredAt)}`}
                  </span>
                </div>
              </div>
              <Space>
                {tradeAlert.status === 'triggered' ? (
                  <Button type="primary" onClick={() => void setStatus(tradeAlert, 'completed')}>
                    标记已处理
                  </Button>
                ) : null}
                {tradeAlert.status === 'active' ? (
                  <Button onClick={() => void setStatus(tradeAlert, 'disabled')}>停用</Button>
                ) : null}
                {tradeAlert.status === 'completed' || tradeAlert.status === 'disabled' ? (
                  <Button onClick={() => void setStatus(tradeAlert, 'active')}>重新启用</Button>
                ) : null}
              </Space>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={createOpen}
        scrollLock={false}
        title="新建自定义价格提醒"
        width={560}
        onCancel={() => setCreateOpen(false)}
        footer={
          <Space>
            <Button onClick={() => setCreateOpen(false)}>取消</Button>
            <Button type="primary" loading={saving} onClick={() => void create()}>
              开始监控
            </Button>
          </Space>
        }
      >
        <p className="dialog-intro">提醒只记录你定义的条件，不会自动交易。</p>
        <Form<CreateTradeAlertInput>
          form={createForm}
          layout="vertical"
          preserve={false}
          initialValues={{ condition: 'at_or_above' satisfies TradeAlertCondition }}
        >
          <div className="form-grid form-grid--2">
            <Form.Item label="标的代码" name="symbol" rules={[{ required: true, message: '请输入标的代码' }]}>
              <SymbolSearchInput placeholder="例如 600519" maxLength={32} />
            </Form.Item>
            <Form.Item label="提醒名称" name="title" rules={[{ required: true, message: '请输入提醒名称' }]}>
              <Input placeholder="例如 突破前高" maxLength={120} />
            </Form.Item>
          </div>
          <Form.Item label="触发方向" name="condition">
            <Radio.Group
              optionType="button"
              options={[
                { label: '达到或高于', value: 'at_or_above' },
                { label: '达到或低于', value: 'at_or_below' },
              ]}
            />
          </Form.Item>
          <Form.Item label="目标价格" name="targetPrice" rules={[{ required: true, message: '请输入目标价格' }]}>
            <InputNumber min={0.0001} precision={4} placeholder="0.0000" />
          </Form.Item>
        </Form>
      </Modal>
    </main>
  );
}
