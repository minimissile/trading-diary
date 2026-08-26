import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { SymbolSearchInput } from '../components/trading/SymbolSearchInput';

interface QuoteFormValues {
  symbol: string;
  price: number;
}

type AlertFilter = 'open' | 'history';

export function AlertsPage(): React.JSX.Element {
  const { message } = App.useApp();
  const [quoteForm] = Form.useForm<QuoteFormValues>();
  const [createForm] = Form.useForm<CreateTradeAlertInput>();
  const [alerts, setAlerts] = useState<TradeAlert[]>([]);
  const [filter, setFilter] = useState<AlertFilter>('open');
  const [createOpen, setCreateOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastEvaluation, setLastEvaluation] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      setAlerts(await window.desktop.alerts.list());
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '提醒读取失败');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    let active = true;
    void window.desktop.alerts
      .list()
      .then((nextAlerts) => {
        if (active) setAlerts(nextAlerts);
      })
      .catch((reason: unknown) => {
        if (active) void message.error(reason instanceof Error ? reason.message : '提醒读取失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [message]);

  const visibleAlerts = useMemo(
    () =>
      alerts.filter((alert) =>
        filter === 'open'
          ? alert.status === 'active' || alert.status === 'triggered'
          : alert.status === 'completed' || alert.status === 'disabled',
      ),
    [alerts, filter],
  );

  const evaluate = async (values: QuoteFormValues): Promise<void> => {
    setEvaluating(true);
    try {
      const result = await window.desktop.alerts.evaluatePrice(values.symbol.trim().toUpperCase(), values.price);
      window.dispatchEvent(new Event('workspace-changed'));
      await load();
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
      window.dispatchEvent(new Event('workspace-changed'));
      await load();
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
      window.dispatchEvent(new Event('workspace-changed'));
      await load();
      void message.success(status === 'active' ? '提醒已重新启用' : status === 'completed' ? '提醒已处理' : '提醒已停用');
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '提醒更新失败');
    }
  };

  return (
    <main className="workspace-page">
      <header className="page-header">
        <div>
          <p className="page-kicker">ALERT ENGINE</p>
          <h1>买卖点提醒</h1>
          <p className="page-intro">提醒执行你的计划，不替你做投资决策。</p>
        </div>
        <Button type="primary" size="large" onClick={() => setCreateOpen(true)}>
          新建价格提醒
        </Button>
      </header>

      <section className="quote-evaluator">
        <div>
          <span className="section-label">快速验收</span>
          <h2>输入一笔最新价，运行提醒引擎</h2>
          <p>后续接入行情源后会复用同一套判断逻辑；本轮无需依赖外部服务即可验收。</p>
        </div>
        <Form<QuoteFormValues>
          className="quote-form"
          form={quoteForm}
          layout="inline"
          onFinish={(values) => void evaluate(values)}
        >
          <Form.Item name="symbol" rules={[{ required: true, message: '请输入代码' }]}>
            <SymbolSearchInput placeholder="标的代码" maxLength={32} resolveOnBlur={false} />
          </Form.Item>
          <Form.Item name="price" rules={[{ required: true, message: '请输入最新价' }]}>
            <InputNumber min={0.0001} precision={4} placeholder="最新价" />
          </Form.Item>
          <Button htmlType="submit" type="primary" loading={evaluating}>
            检查并触发
          </Button>
        </Form>
      </section>

      {lastEvaluation ? <Alert className="evaluation-result" type="info" title={lastEvaluation} showIcon closable /> : null}

      <div className="page-toolbar">
        <Segmented<AlertFilter>
          options={[
            { label: '监控与触发', value: 'open' },
            { label: '处理历史', value: 'history' },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </div>

      {loading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : visibleAlerts.length === 0 ? (
        <div className="empty-panel">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={filter === 'open' ? '还没有正在监控的提醒' : '还没有提醒历史'}
          />
        </div>
      ) : (
        <div className="alert-list">
          {visibleAlerts.map((tradeAlert) => (
            <article className={`alert-card alert-card--${tradeAlert.status}`} key={tradeAlert.id}>
              <span className="signal-square" aria-hidden="true" />
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
