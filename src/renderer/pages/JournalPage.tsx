import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Skeleton,
  Space,
  Statistic,
  Switch,
  Tag,
} from 'antd';
import { useLocation, useNavigate } from 'react-router';
import type { CreateTradeReviewInput, TradeDirection, TradeReview, TradingPlan } from '../../shared/api.types';
import { directionLabels, formatCurrency, formatDateTime, formatPrice } from '../lib/trading-format';
import { useReviewAiDraft } from '../hooks/useReviewAiDraft';
import { routePaths } from '../router/paths';
import { SymbolSearchInput } from '../components/trading/SymbolSearchInput';

interface JournalLocationState {
  planId?: string;
}

interface ReviewFormValues {
  planId?: string;
  symbol: string;
  title: string;
  direction: TradeDirection;
  planned: boolean;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  fees: number;
  executionScore: number;
  summary: string;
  lesson: string;
}

export function JournalPage(): React.JSX.Element {
  const { message } = App.useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const requestedPlanId = (location.state as JournalLocationState | null)?.planId ?? null;
  const [reviews, setReviews] = useState<TradeReview[]>([]);
  const [plans, setPlans] = useState<TradingPlan[]>([]);
  const [dialogOpen, setDialogOpen] = useState(Boolean(requestedPlanId));
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    try {
      const [nextReviews, nextPlans] = await Promise.all([window.desktop.reviews.list(), window.desktop.plans.list()]);
      setReviews(nextReviews);
      setPlans(nextPlans);
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '交易日记读取失败');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    let active = true;
    void Promise.all([window.desktop.reviews.list(), window.desktop.plans.list()])
      .then(([nextReviews, nextPlans]) => {
        if (!active) return;
        setReviews(nextReviews);
        setPlans(nextPlans);
      })
      .catch((reason: unknown) => {
        if (active) void message.error(reason instanceof Error ? reason.message : '交易日记读取失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [message]);

  const reviewedPlanIds = useMemo(() => new Set(reviews.flatMap((review) => (review.planId ? [review.planId] : []))), [reviews]);
  const reviewablePlans = useMemo(
    () => plans.filter((plan) => plan.status === 'completed' && !reviewedPlanIds.has(plan.id)),
    [plans, reviewedPlanIds],
  );
  const totalPnl = reviews.reduce((total, review) => total + review.pnl, 0);
  const averageScore =
    reviews.length === 0 ? null : reviews.reduce((total, review) => total + review.executionScore, 0) / reviews.length;

  return (
    <main className="workspace-page">
      <header className="page-header">
        <div>
          <p className="page-kicker">REVIEW JOURNAL</p>
          <h1>交易日记</h1>
          <p className="page-intro">把结果和过程分开记录，让下一次行动真正发生变化。</p>
        </div>
        <Button type="primary" size="large" onClick={() => setDialogOpen(true)}>
          新建复盘
        </Button>
      </header>

      <section className="journal-stats">
        <article className={totalPnl >= 0 ? 'metric-profit' : 'metric-loss'}>
          <Statistic title="已复盘净盈亏" value={formatCurrency(totalPnl)} />
        </article>
        <article>
          <Statistic title="已复盘交易" value={reviews.length} suffix="笔" />
        </article>
        <article>
          <Statistic
            title="平均纪律评分"
            value={averageScore === null ? '—' : averageScore.toFixed(1)}
            suffix={averageScore === null ? '' : '/ 5'}
          />
        </article>
        <article>
          <Statistic title="待复盘计划" value={reviewablePlans.length} suffix="笔" />
        </article>
      </section>

      {loading ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : reviews.length === 0 ? (
        <div className="empty-panel">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有完成的交易复盘">
            <Button type="primary" onClick={() => setDialogOpen(true)}>
              记录第一笔复盘
            </Button>
          </Empty>
        </div>
      ) : (
        <div className="review-list">
          {reviews.map((review) => (
            <article className="review-card" key={review.id}>
              <div className="review-card-header">
                <div>
                  <span className="symbol-label">{review.symbol}</span>
                  <h2>{review.title}</h2>
                </div>
                <div className="review-tags">
                  <Tag color={review.planned ? 'blue' : 'orange'}>{review.planned ? '计划内交易' : '计划外交易'}</Tag>
                  <Tag>{directionLabels[review.direction]}</Tag>
                </div>
              </div>
              <div className="review-result-grid">
                <div>
                  <small>入场 / 退出</small>
                  <strong>
                    {formatPrice(review.entryPrice)} → {formatPrice(review.exitPrice)}
                  </strong>
                </div>
                <div>
                  <small>数量 / 费用</small>
                  <strong>
                    {review.quantity} / {formatCurrency(review.fees)}
                  </strong>
                </div>
                <div className={review.pnl >= 0 ? 'profit-text' : 'loss-text'}>
                  <small>净盈亏</small>
                  <strong>{formatCurrency(review.pnl)}</strong>
                </div>
                <div>
                  <small>纪律评分</small>
                  <strong>{review.executionScore} / 5</strong>
                </div>
              </div>
              <div className="review-notes">
                <div>
                  <span>本次总结</span>
                  <p>{review.summary}</p>
                </div>
                <div>
                  <span>下一次规则</span>
                  <p>{review.lesson}</p>
                </div>
              </div>
              <time>{formatDateTime(review.createdAt)} 完成复盘</time>
            </article>
          ))}
        </div>
      )}

      <NewReviewDialog
        open={dialogOpen}
        plans={reviewablePlans}
        initialPlanId={requestedPlanId}
        onClose={() => {
          setDialogOpen(false);
          void navigate(routePaths.journal, { replace: true });
        }}
        onSaved={() => {
          setDialogOpen(false);
          window.dispatchEvent(new Event('workspace-changed'));
          void navigate(routePaths.journal, { replace: true });
          void load();
          void message.success('复盘已保存，首页待复盘任务已更新');
        }}
      />
    </main>
  );
}

interface NewReviewDialogProps {
  open: boolean;
  plans: TradingPlan[];
  initialPlanId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

function NewReviewDialog({ open, plans, initialPlanId, onClose, onSaved }: NewReviewDialogProps): React.JSX.Element {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm<ReviewFormValues>();
  const [saving, setSaving] = useState(false);
  const { loading: aiLoading, streamingText, error: aiError, notConfigured, budgetExceeded, generateDraftStream, resetError, cancelStream } =
    useReviewAiDraft();
  const entryPrice = Form.useWatch('entryPrice', form);
  const exitPrice = Form.useWatch('exitPrice', form);
  const quantity = Form.useWatch('quantity', form);
  const fees = Form.useWatch('fees', form);
  const direction = Form.useWatch('direction', form);
  const pnlPreview =
    typeof entryPrice === 'number' && typeof exitPrice === 'number' && typeof quantity === 'number'
      ? (exitPrice - entryPrice) * quantity * (direction === 'short' ? -1 : 1) - (typeof fees === 'number' ? fees : 0)
      : null;

  useEffect(() => {
    if (!open) {
      cancelStream();
      resetError();
      return;
    }
    const plan = plans.find((item) => item.id === initialPlanId);
    form.setFieldsValue(
      plan
        ? {
            planId: plan.id,
            symbol: plan.symbol,
            title: `${plan.name}复盘`,
            direction: plan.direction,
            planned: true,
            entryPrice: plan.entryPrice,
            fees: 0,
            executionScore: 3,
          }
        : { direction: 'long', planned: false, fees: 0, executionScore: 3 },
    );
  }, [cancelStream, form, initialPlanId, open, plans, resetError]);

  const generateAiDraft = async (): Promise<void> => {
    const values = await form.validateFields([
      'planId',
      'symbol',
      'title',
      'direction',
      'planned',
      'entryPrice',
      'exitPrice',
      'quantity',
      'fees',
      'executionScore',
    ]);

    const draft = await generateDraftStream({
      planId: values.planId ?? null,
      symbol: values.symbol.trim().toUpperCase(),
      title: values.title.trim(),
      direction: values.direction,
      planned: values.planned,
      entryPrice: values.entryPrice,
      exitPrice: values.exitPrice,
      quantity: values.quantity,
      fees: values.fees,
      executionScore: values.executionScore,
      partialSummary: form.getFieldValue('summary') as string | undefined,
      partialLesson: form.getFieldValue('lesson') as string | undefined,
    });

    if (!draft) {
      if (notConfigured) {
        void message.warning('请先在设置中配置 OpenRouter API Key');
        void navigate(routePaths.settings);
      } else if (budgetExceeded) {
        void message.warning('本月 token 预算已用尽');
        void navigate(routePaths.settings);
      } else if (aiError) {
        void message.error(aiError);
      }
      return;
    }

    form.setFieldsValue({ summary: draft.summary, lesson: draft.lesson });
    void message.success('AI 草稿已生成，请核对后保存');
  };

  const choosePlan = (planId: string | undefined): void => {
    const plan = plans.find((item) => item.id === planId);
    if (!plan) {
      form.setFieldsValue({ planId: undefined, planned: false });
      return;
    }
    form.setFieldsValue({
      planId: plan.id,
      symbol: plan.symbol,
      title: `${plan.name}复盘`,
      direction: plan.direction,
      planned: true,
      entryPrice: plan.entryPrice,
    });
  };

  const save = async (): Promise<void> => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const input: CreateTradeReviewInput = {
        ...values,
        planId: values.planId ?? null,
        symbol: values.symbol.trim().toUpperCase(),
      };
      await window.desktop.reviews.create(input);
      form.resetFields();
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      destroyOnHidden
      open={open}
      scrollLock={false}
      title="完成单笔复盘"
      width={760}
      onCancel={onClose}
      footer={
        <Space>
          <Button onClick={onClose}>取消</Button>
          {aiLoading ? (
            <Button onClick={() => cancelStream()}>停止生成</Button>
          ) : null}
          <Button loading={aiLoading} onClick={() => void generateAiDraft()}>
            AI 流式生成
          </Button>
          <Button type="primary" loading={saving} onClick={() => void save()}>
            完成复盘
          </Button>
        </Space>
      }
    >
      <p className="dialog-intro">盈亏是结果，纪律评分只评价你是否按规则执行。AI 草稿仅归纳已有记录，不会给出买卖建议。</p>
      {streamingText ? (
        <pre className="ai-stream-preview">{streamingText}</pre>
      ) : null}
      <Form<ReviewFormValues> form={form} layout="vertical" preserve={false}>
        <Form.Item label="关联已结束计划（可选）" name="planId">
          <Select
            allowClear
            placeholder="选择后自动带入计划信息"
            options={plans.map((plan) => ({ label: `${plan.name} · ${plan.symbol}`, value: plan.id }))}
            onChange={choosePlan}
          />
        </Form.Item>
        <div className="form-grid form-grid--2">
          <Form.Item label="标的代码" name="symbol" rules={[{ required: true, message: '请输入标的代码' }]}>
            <SymbolSearchInput maxLength={32} />
          </Form.Item>
          <Form.Item label="复盘标题" name="title" rules={[{ required: true, message: '请输入复盘标题' }]}>
            <Input maxLength={120} />
          </Form.Item>
        </div>
        <div className="review-form-switches">
          <Form.Item label="交易方向" name="direction">
            <Radio.Group
              optionType="button"
              options={[
                { label: '做多', value: 'long' },
                { label: '做空', value: 'short' },
              ]}
            />
          </Form.Item>
          <Form.Item label="是否属于计划内交易" name="planned" valuePropName="checked">
            <Switch />
          </Form.Item>
        </div>
        <div className="form-grid form-grid--4">
          <Form.Item label="实际入场价" name="entryPrice" rules={[{ required: true, message: '请输入入场价' }]}>
            <InputNumber min={0.0001} precision={4} />
          </Form.Item>
          <Form.Item label="实际退出价" name="exitPrice" rules={[{ required: true, message: '请输入退出价' }]}>
            <InputNumber min={0.0001} precision={4} />
          </Form.Item>
          <Form.Item label="成交数量" name="quantity" rules={[{ required: true, message: '请输入数量' }]}>
            <InputNumber min={0.0001} precision={4} />
          </Form.Item>
          <Form.Item label="总费用" name="fees" rules={[{ required: true, message: '请输入费用' }]}>
            <InputNumber min={0} precision={2} prefix="¥" />
          </Form.Item>
        </div>
        <div className="review-score-row">
          <Form.Item label="纪律评分（与盈亏无关）" name="executionScore" rules={[{ required: true }]}>
            <InputNumber min={1} max={5} precision={0} />
          </Form.Item>
          <div className={pnlPreview !== null && pnlPreview < 0 ? 'loss-text' : 'profit-text'}>
            <small>预计净盈亏</small>
            <strong>{pnlPreview === null ? '—' : formatCurrency(pnlPreview)}</strong>
          </div>
        </div>
        <Form.Item label="本次交易总结" name="summary" rules={[{ required: true, message: '请填写本次总结' }]}>
          <Input.TextArea rows={3} maxLength={2000} showCount placeholder="原计划、实际执行和结果分别如何？" />
        </Form.Item>
        <Form.Item label="下一次要执行的规则" name="lesson" rules={[{ required: true, message: '请写下一条行动规则' }]}>
          <Input.TextArea rows={3} maxLength={2000} showCount placeholder="写成可以在下一笔交易前检查的动作。" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
