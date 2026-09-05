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
import { PlusOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router';
import type { CreateTradeReviewInput, TradeDirection, TradeEpisodeView, TradingPlan } from '../../shared/api.types';
import { ExecutionEntryModal } from '../components/trading/ExecutionEntryModal';
import { EpisodeTimeline } from '../components/trading/EpisodeTimeline';
import {
  directionLabels,
  formatDateTime,
  formatPrice,
  formatSignedCurrency,
  statisticCurrencyFormatter,
  ValueDisplay,
} from '../lib/trading-format';
import { useReviewAiDraft } from '../hooks/useReviewAiDraft';
import { useTradingAccountId } from '../hooks/useTradingAccountId';
import { invalidateWorkspaceData, useEpisodesQuery, usePlansQuery, useReviewsQuery } from '../lib/queries';
import { routePaths } from '../router/paths';
import type { JournalLocationState, JournalReviewDraft } from '../router/journal-state';
import { SymbolSearchInput } from '../components/trading/SymbolSearchInput';

interface ReviewFormValues {
  planId?: string;
  episodeId?: string;
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
  saveToPlaybook: boolean;
}

export function JournalPage(): React.JSX.Element {
  const { message } = App.useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [accountId] = useTradingAccountId();
  const state = location.state as JournalLocationState | null;
  const requestedPlanId = state?.planId ?? null;
  const requestedEpisodeId = state?.episodeId ?? null;
  const requestedReviewDraft = state?.reviewDraft ?? null;
  const requestedOpenReview = state?.openReview ?? false;
  const requestedOpenExecution = state?.openExecution ?? false;

  const [executionOpen, setExecutionOpen] = useState(requestedOpenExecution);
  const [reviewOpen, setReviewOpen] = useState(
    Boolean(requestedPlanId || requestedEpisodeId || requestedReviewDraft || requestedOpenReview),
  );
  const [initialPlanId, setInitialPlanId] = useState<string | null>(requestedPlanId);
  const [initialEpisodeId, setInitialEpisodeId] = useState<string | null>(requestedEpisodeId);
  const [initialReviewDraft, setInitialReviewDraft] = useState<JournalReviewDraft | null>(requestedReviewDraft);
  const { reviews, isLoading: reviewsLoading, refetch: refetchReviews } = useReviewsQuery();
  const { episodes, isLoading: episodesLoading, refetch: refetchEpisodes } = useEpisodesQuery(accountId);
  const { plans, isLoading: plansLoading } = usePlansQuery();
  const loading = reviewsLoading || episodesLoading || plansLoading;

  const reloadJournal = useCallback(async (): Promise<void> => {
    await Promise.all([refetchReviews(), refetchEpisodes()]);
  }, [refetchEpisodes, refetchReviews]);

  useEffect(() => {
    if (!state?.reviewDraft && !state?.openReview && !state?.openExecution && !state?.episodeId && !state?.planId) return;
    setInitialReviewDraft(state.reviewDraft ?? null);
    setInitialPlanId(state.planId ?? null);
    setInitialEpisodeId(state.episodeId ?? null);
    if (state.openExecution) setExecutionOpen(true);
    if (state.openReview || state.reviewDraft || state.episodeId || state.planId) setReviewOpen(true);
    void navigate(routePaths.journal, { replace: true });
  }, [navigate, state]);

  const reviewedPlanIds = useMemo(() => new Set(reviews.flatMap((review) => (review.planId ? [review.planId] : []))), [reviews]);
  const reviewablePlans = useMemo(
    () => plans.filter((plan) => plan.status === 'completed' && !reviewedPlanIds.has(plan.id)),
    [plans, reviewedPlanIds],
  );
  const openEpisodes = useMemo(() => episodes.filter((episode) => episode.status === 'open'), [episodes]);
  const pendingEpisodes = useMemo(
    () => episodes.filter((episode) => episode.status === 'closed' && episode.reviewId === null),
    [episodes],
  );

  const totalPnl = reviews.reduce((total, review) => total + review.pnl, 0);
  const averageScore =
    reviews.length === 0 ? null : reviews.reduce((total, review) => total + review.executionScore, 0) / reviews.length;

  const openReviewForEpisode = (episode: TradeEpisodeView): void => {
    setInitialEpisodeId(episode.id);
    setInitialPlanId(episode.planId);
    setInitialReviewDraft(null);
    setReviewOpen(true);
  };

  return (
    <main className="workspace-page journal-page">
      <header className="page-header">
        <div>
          <p className="page-kicker">REVIEW JOURNAL</p>
          <h1>交易日记</h1>
          <p className="page-intro">先记录真实成交，再在回合结束后复盘——过程与结果分开看。</p>
        </div>
        <Space>
          <Button icon={<PlusOutlined />} onClick={() => setExecutionOpen(true)}>
            记录成交
          </Button>
          <Button
            type="primary"
            onClick={() => {
              setInitialReviewDraft(null);
              setInitialEpisodeId(null);
              setInitialPlanId(null);
              setReviewOpen(true);
            }}
          >
            新建复盘
          </Button>
        </Space>
      </header>

      <section className="journal-stats">
        <article className={totalPnl >= 0 ? 'metric-profit' : 'metric-loss'}>
          <Statistic title="已复盘净盈亏" value={totalPnl} formatter={statisticCurrencyFormatter} />
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
          <Statistic title="待复盘回合" value={pendingEpisodes.length + reviewablePlans.length} suffix="笔" />
        </article>
      </section>

      {loading ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : (
        <>
          {openEpisodes.length > 0 ? (
            <section className="journal-section">
              <header className="section-inline-header">
                <h2>持仓中的回合</h2>
                <span>{openEpisodes.length} 笔进行中</span>
              </header>
              <div className="episode-list">
                {openEpisodes.map((episode) => (
                  <article className="episode-card episode-card--open" key={episode.id}>
                    <div className="episode-card-header">
                      <div>
                        <span className="symbol-label">{episode.symbol}</span>
                        <h3>{episode.title}</h3>
                      </div>
                      <Tag color="green">持仓中 · {episode.netQuantity}</Tag>
                    </div>
                    <div className="review-result-grid">
                      <div>
                        <small>均价</small>
                        <strong>{episode.avgEntryPrice === null ? '—' : formatPrice(episode.avgEntryPrice)}</strong>
                      </div>
                      <div>
                        <small>成交笔数</small>
                        <strong>{episode.executions.length}</strong>
                      </div>
                      <div>
                        <small>累计费用</small>
                        <ValueDisplay as="strong" kind="currency" value={episode.totalFees} />
                      </div>
                    </div>
                    <EpisodeTimeline executions={episode.executions} />
                    <Button size="small" onClick={() => setExecutionOpen(true)}>
                      继续录入
                    </Button>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {pendingEpisodes.length > 0 ? (
            <section className="journal-section">
              <header className="section-inline-header">
                <h2>待复盘回合</h2>
                <span>平仓后 48 小时内完成复盘效果最好</span>
              </header>
              <div className="episode-list">
                {pendingEpisodes.map((episode) => (
                  <article className="episode-card episode-card--pending" key={episode.id}>
                    <div className="episode-card-header">
                      <div>
                        <span className="symbol-label">{episode.symbol}</span>
                        <h3>{episode.title}</h3>
                      </div>
                      <Tag color="orange">待复盘</Tag>
                    </div>
                    <div className="review-result-grid">
                      <div>
                        <small>入场 / 退出</small>
                        <strong>
                          {episode.avgEntryPrice === null ? '—' : formatPrice(episode.avgEntryPrice)} →{' '}
                          {episode.avgExitPrice === null ? '—' : formatPrice(episode.avgExitPrice)}
                        </strong>
                      </div>
                      <div>
                        <small>数量</small>
                        <strong>{episode.closedQuantity}</strong>
                      </div>
                      <div>
                        <small>已实现盈亏</small>
                        <ValueDisplay as="strong" kind="pnl" value={episode.realizedPnl} />
                      </div>
                    </div>
                    <EpisodeTimeline executions={episode.executions} />
                    <Button type="primary" size="small" onClick={() => openReviewForEpisode(episode)}>
                      开始复盘
                    </Button>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {reviews.length === 0 && pendingEpisodes.length === 0 && openEpisodes.length === 0 ? (
            <div className="empty-panel">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有成交记录，先录入一笔买卖">
                <Button type="primary" onClick={() => setExecutionOpen(true)}>
                  记录第一笔成交
                </Button>
              </Empty>
            </div>
          ) : reviews.length > 0 ? (
            <section className="journal-section">
              <header className="section-inline-header">
                <h2>已完成复盘</h2>
              </header>
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
                          {review.quantity} / <ValueDisplay kind="currency" value={review.fees} />
                        </strong>
                      </div>
                      <div>
                        <small>净盈亏</small>
                        <ValueDisplay as="strong" kind="pnl" value={review.pnl} />
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
            </section>
          ) : null}
        </>
      )}

      <ExecutionEntryModal
        open={executionOpen}
        defaultAccountId={accountId}
        onClose={() => setExecutionOpen(false)}
        onSaved={() => {
          void invalidateWorkspaceData().then(() => reloadJournal());
        }}
      />

      <NewReviewDialog
        open={reviewOpen}
        plans={reviewablePlans}
        episodes={pendingEpisodes}
        initialPlanId={initialPlanId}
        initialEpisodeId={initialEpisodeId}
        initialReviewDraft={initialReviewDraft}
        onClose={() => {
          setReviewOpen(false);
          setInitialReviewDraft(null);
          setInitialEpisodeId(null);
          setInitialPlanId(null);
        }}
        onSaved={() => {
          setReviewOpen(false);
          setInitialReviewDraft(null);
          setInitialEpisodeId(null);
          setInitialPlanId(null);
          void invalidateWorkspaceData().then(() => reloadJournal());
          void message.success('复盘已保存');
        }}
      />
    </main>
  );
}

interface NewReviewDialogProps {
  open: boolean;
  plans: TradingPlan[];
  episodes: TradeEpisodeView[];
  initialPlanId: string | null;
  initialEpisodeId: string | null;
  initialReviewDraft: JournalReviewDraft | null;
  onClose: () => void;
  onSaved: () => void;
}

function NewReviewDialog({
  open,
  plans,
  episodes,
  initialPlanId,
  initialEpisodeId,
  initialReviewDraft,
  onClose,
  onSaved,
}: NewReviewDialogProps): React.JSX.Element {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm<ReviewFormValues>();
  const [saving, setSaving] = useState(false);
  const {
    loading: aiLoading,
    streamingText,
    error: aiError,
    notConfigured,
    budgetExceeded,
    generateDraftStream,
    resetError,
    cancelStream,
  } = useReviewAiDraft();
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

    const episode = episodes.find((item) => item.id === initialEpisodeId);
    const plan =
      plans.find((item) => item.id === initialPlanId) ??
      (episode?.planId ? plans.find((item) => item.id === episode.planId) : undefined);

    if (initialReviewDraft) {
      form.setFieldsValue({
        episodeId: initialReviewDraft.episodeId,
        symbol: initialReviewDraft.symbol,
        title: initialReviewDraft.title,
        direction: initialReviewDraft.direction,
        planned: initialReviewDraft.planned,
        entryPrice: initialReviewDraft.entryPrice,
        exitPrice: initialReviewDraft.exitPrice,
        quantity: initialReviewDraft.quantity,
        fees: initialReviewDraft.fees,
        executionScore: 3,
      });
      return;
    }

    if (episode) {
      form.setFieldsValue({
        episodeId: episode.id,
        planId: episode.planId ?? plan?.id,
        symbol: episode.symbol,
        title: `${episode.title}复盘`,
        direction: episode.direction,
        planned: Boolean(episode.planId),
        entryPrice: episode.avgEntryPrice ?? undefined,
        exitPrice: episode.avgExitPrice ?? undefined,
        quantity: episode.closedQuantity || episode.netQuantity,
        fees: episode.totalFees,
        executionScore: 3,
      });
      return;
    }

    if (plan) {
      form.setFieldsValue({
        planId: plan.id,
        symbol: plan.symbol,
        title: `${plan.name}复盘`,
        direction: plan.direction,
        planned: true,
        entryPrice: plan.entryPrice,
        fees: 0,
        executionScore: 3,
      });
      return;
    }

    form.setFieldsValue({ direction: 'long', planned: false, fees: 0, executionScore: 3 });
  }, [cancelStream, episodes, form, initialEpisodeId, initialPlanId, initialReviewDraft, open, plans, resetError]);

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

  const chooseEpisode = (episodeId: string | undefined): void => {
    const episode = episodes.find((item) => item.id === episodeId);
    if (!episode) {
      form.setFieldsValue({ episodeId: undefined });
      return;
    }
    form.setFieldsValue({
      episodeId: episode.id,
      planId: episode.planId ?? undefined,
      symbol: episode.symbol,
      title: `${episode.title}复盘`,
      direction: episode.direction,
      planned: Boolean(episode.planId),
      entryPrice: episode.avgEntryPrice ?? undefined,
      exitPrice: episode.avgExitPrice ?? undefined,
      quantity: episode.closedQuantity || episode.netQuantity,
      fees: episode.totalFees,
    });
  };

  const save = async (): Promise<void> => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const input: CreateTradeReviewInput = {
        ...values,
        planId: values.planId ?? null,
        episodeId: values.episodeId ?? null,
        symbol: values.symbol.trim().toUpperCase(),
        saveToPlaybook: values.saveToPlaybook,
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
          {aiLoading ? <Button onClick={() => cancelStream()}>停止生成</Button> : null}
          <Button loading={aiLoading} onClick={() => void generateAiDraft()}>
            AI 流式生成
          </Button>
          <Button type="primary" loading={saving} onClick={() => void save()}>
            完成复盘
          </Button>
        </Space>
      }
    >
      <p className="dialog-intro">盈亏是结果，纪律评分只评价你是否按规则执行。事实数据来自成交回合，请在此基础上解释原因。</p>
      {streamingText ? <pre className="ai-stream-preview">{streamingText}</pre> : null}
      <Form<ReviewFormValues> form={form} layout="vertical" preserve={false}>
        <Form.Item label="关联交易回合（推荐）" name="episodeId">
          <Select
            allowClear
            placeholder="选择已平仓待复盘的回合"
            options={episodes.map((episode) => ({
              label: `${episode.symbol} · ${episode.title} · ${episode.realizedPnl === null ? '—' : formatSignedCurrency(episode.realizedPnl)}`,
              value: episode.id,
            }))}
            onChange={chooseEpisode}
          />
        </Form.Item>
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
          <div>
            <small>预计净盈亏</small>
            <ValueDisplay as="strong" kind="pnl" value={pnlPreview} />
          </div>
        </div>
        <Form.Item label="本次交易总结" name="summary" rules={[{ required: true, message: '请填写本次总结' }]}>
          <Input.TextArea rows={3} maxLength={2000} showCount placeholder="这笔交易原本要赚什么钱？实际执行是否符合计划？" />
        </Form.Item>
        <Form.Item label="下一次要执行的规则" name="lesson" rules={[{ required: true, message: '请写下一条行动规则' }]}>
          <Input.TextArea rows={3} maxLength={2000} showCount placeholder="写成可以在下一笔交易前检查的动作。" />
        </Form.Item>
        <Form.Item label="写入规则库" name="saveToPlaybook" valuePropName="checked" initialValue={true}>
          <Switch checkedChildren="是" unCheckedChildren="否" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
