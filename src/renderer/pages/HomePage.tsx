import {
  ImportOutlined,
  PlusOutlined,
  ProjectOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Alert, App, Button, Empty, Segmented, Skeleton, Tag } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { TradeAlert } from '../../shared/api.types';
import { summarizeActionHint } from '../../shared/lof-arbitrage/action-hint';
import { CommandPanel } from '../components/home/CommandPanel';
import type { ActionItem, QueueCategory } from '../components/home/types';
import { PlanCreateModal } from '../components/trading/PlanCreateModal';
import { formatAlertCondition, formatCurrency, formatPrice, ValueDisplay } from '../lib/trading-format';
import { priceListPresetForKind } from '../../shared/format/display-presets';
import { invalidateWorkspaceData, useHomeLofPreviewQuery, useHomeOverlapPoolQuery, useWorkspaceSnapshot } from '../lib/queries';
import { routePaths } from '../router/paths';
import '../styles/home.css';

export function HomePage(): React.JSX.Element {
  const { message } = App.useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const { snapshot, isLoading: loading, isError, refetch } = useWorkspaceSnapshot();
  const { items: overlapPreview, isLoading: overlapLoading } = useHomeOverlapPoolQuery();
  const { items: lofPreview } = useHomeLofPreviewQuery();
  const [newPlanOpen, setNewPlanOpen] = useState(() => Boolean((location.state as { newPlan?: boolean } | null)?.newPlan));
  const [queueFilter, setQueueFilter] = useState<QueueCategory>('all');

  useEffect(() => {
    const state = location.state as { newPlan?: boolean } | null;
    if (!state?.newPlan) return;
    void navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    const openDialog = (): void => setNewPlanOpen(true);
    window.addEventListener('open-plan-create', openDialog);
    return () => window.removeEventListener('open-plan-create', openDialog);
  }, []);

  const realActionItems = useMemo<ActionItem[]>(() => {
    if (!snapshot) return [];
    const alerts = snapshot.triggeredAlerts.map((alert) => ({
      id: alert.id,
      priority: 'high' as const,
      category: 'reminder' as const,
      type: '触发提醒',
      symbol: alert.title,
      code: alert.symbol,
      description: formatAlertCondition(alert.condition, alert.targetPrice),
      price: formatPrice(alert.lastPrice ?? alert.targetPrice),
      change: '已触发',
      status: '待处理',
      statusTone: 'warning' as const,
      action: '处理提醒',
      source: alert,
    }));
    const plans = snapshot.activePlans.map((plan) => ({
      id: plan.id,
      priority: 'medium' as const,
      category: 'due' as const,
      type: plan.status === 'holding' ? '持仓计划' : '计划待执行',
      symbol: plan.name,
      code: plan.symbol,
      description: plan.thesis,
      price: formatPrice(plan.entryPrice),
      change: `${plan.riskAmount.toFixed(0)} 风险`,
      status: plan.status === 'holding' ? '持仓中' : '等待入场',
      statusTone: plan.status === 'holding' ? ('success' as const) : ('warning' as const),
      action: plan.status === 'holding' ? '结束并复盘' : '确认入场',
      source: plan,
    }));
    const planReviews = snapshot.pendingReviewPlans.map((plan) => ({
      id: `review-plan-${plan.id}`,
      priority: 'medium' as const,
      category: 'review' as const,
      type: '待复盘',
      symbol: plan.name,
      code: plan.symbol,
      description: plan.thesis,
      price: formatPrice(plan.entryPrice),
      change: '计划已结束',
      status: '已完成',
      statusTone: 'success' as const,
      action: '开始复盘',
      source: plan,
    }));
    const episodeReviews = snapshot.pendingReviewEpisodes.map((episode) => ({
      id: `review-episode-${episode.id}`,
      priority: 'high' as const,
      category: 'review' as const,
      type: '待复盘',
      symbol: episode.title,
      code: episode.symbol,
      description: `已实现 ${episode.realizedPnl === null ? '—' : formatCurrency(episode.realizedPnl)}`,
      price: episode.avgExitPrice === null ? '—' : formatPrice(episode.avgExitPrice),
      change: `${episode.closedQuantity} 股`,
      status: '已平仓',
      statusTone: 'success' as const,
      action: '开始复盘',
      source: episode,
    }));
    const sipDue = snapshot.dueSipOccurrences.map((occurrence) => ({
      id: `sip-${occurrence.id}`,
      priority: 'high' as const,
      category: 'due' as const,
      type: '待执行定投',
      symbol: occurrence.planName,
      code: occurrence.symbol,
      description: `计划扣款 ${formatCurrency(occurrence.plannedAmount)} · ${occurrence.scheduledDate}`,
      price: formatCurrency(occurrence.plannedAmount),
      change: '待确认',
      status: '已到期',
      statusTone: 'warning' as const,
      action: '确认扣款',
      source: occurrence,
    }));
    return [...alerts, ...sipDue, ...episodeReviews, ...plans, ...planReviews];
  }, [snapshot]);

  const actionItems = realActionItems;
  const visibleActions = queueFilter === 'all' ? actionItems : actionItems.filter((item) => item.category === queueFilter);

  const completeAlert = async (alert: TradeAlert): Promise<void> => {
    try {
      await window.desktop.alerts.setStatus(alert.id, 'completed');
      await invalidateWorkspaceData();
      void message.success('提醒已标记为处理完成');
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '提醒处理失败');
    }
  };

  const handleAction = async (item: ActionItem): Promise<void> => {
    if (item.source && 'plannedAmount' in item.source) {
      void navigate(routePaths.sip, { state: { confirmOccurrenceId: item.source.id } });
      return;
    }
    if (item.source && 'condition' in item.source) {
      await completeAlert(item.source);
      return;
    }
    if (item.source && 'executions' in item.source) {
      if (item.category === 'review') {
        void navigate(routePaths.journal, { state: { episodeId: item.source.id, openReview: true } });
        return;
      }
    }
    if (item.source && 'entryPrice' in item.source) {
      if (item.category === 'review') {
        void navigate(routePaths.journal, { state: { planId: item.source.id, openReview: true } });
        return;
      }
      const nextStatus = item.source.status === 'watching' ? 'holding' : item.source.status === 'holding' ? 'completed' : null;
      if (nextStatus) {
        await window.desktop.plans.setStatus(item.source.id, nextStatus);
        await invalidateWorkspaceData();
        if (nextStatus === 'completed') void navigate(routePaths.journal, { state: { planId: item.source.id } });
        else void message.success('已确认入场，风险提醒开始监控');
        return;
      }
    }
    void navigate(
      item.category === 'review'
        ? routePaths.journal
        : item.category === 'reminder'
          ? routePaths.alerts
          : item.type === '待执行定投'
            ? routePaths.sip
            : routePaths.plans,
    );
  };

  if (loading) {
    return (
      <div className="command-loading">
        <Skeleton active paragraph={{ rows: 16 }} />
      </div>
    );
  }

  return (
    <main className="command-dashboard command-home">
      <header className="command-welcome">
        <div>
          <p className="page-kicker">TODAY</p>
          <h1>今日指挥台</h1>
          <p>聚焦下一步行动，按计划执行并沉淀每一次交易决策。</p>
        </div>
        <div className="home-header-actions">
          <Button icon={<ImportOutlined />} onClick={() => void navigate(routePaths.import)}>
            导入成交
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setNewPlanOpen(true)}>
            新建计划
          </Button>
        </div>
      </header>
      {isError ? (
        <Alert
          type="error"
          showIcon
          title="工作区数据加载失败"
          description="请重试后查看待办与执行状态。"
          action={<Button onClick={() => void refetch()}>重试</Button>}
        />
      ) : null}
      {!isError ? (
        <section className="home-overview" aria-label="待办概览">
          <div className="home-overview-intro">
            <span>下一步，从这里开始</span>
            <strong>{actionItems.length ? '先处理提醒，再执行计划' : '当前暂无待办'}</strong>
            <p>检查触发条件，执行后及时记录与复盘。</p>
          </div>
          {(
            [
              ['reminder', '触发提醒', '优先确认价格与条件', snapshot?.triggeredAlertCount ?? 0],
              [
                'due',
                '计划与定投',
                '跟进计划与到期扣款',
                (snapshot?.activePlanCount ?? 0) + (snapshot?.dueSipOccurrenceCount ?? 0),
              ],
              ['review', '待复盘', '回顾结果，沉淀经验', snapshot?.pendingReviewCount ?? 0],
            ] as const
          ).map(([key, label, hint, count]) => (
            <button
              key={key}
              type="button"
              className={queueFilter === key ? 'is-selected' : ''}
              onClick={() => setQueueFilter(key)}
              aria-pressed={queueFilter === key}
            >
              <span>
                {label}
                <RightOutlined />
              </span>
              <strong>{count}</strong>
              <small>{hint}</small>
            </button>
          ))}
        </section>
      ) : null}
      <div className="command-grid">
        <CommandPanel
          className="queue-panel"
          number="1."
          title="执行队列"
          meta={`(${actionItems.length})`}
          extra={<span>近期事项 · 完整列表见对应模块</span>}
        >
          <div className="home-queue-toolbar">
            <Segmented
              value={queueFilter}
              onChange={(value) => setQueueFilter(value as QueueCategory)}
              options={[
                { label: `全部 ${actionItems.length}`, value: 'all' },
                { label: '触发提醒', value: 'reminder' },
                { label: '计划与定投', value: 'due' },
                { label: '待复盘', value: 'review' },
              ]}
              aria-label="行动队列筛选"
            />
            <span>{isError ? '数据暂不可用' : `${visibleActions.length} 项待办`}</span>
          </div>
          {isError ? null : visibleActions.length === 0 ? (
            <Empty description={queueFilter === 'all' ? '当前没有待处理事项，按自己的节奏继续。' : '此分类暂无待办'} />
          ) : (
            <div className="action-table">
              <div className="action-table-head">
                <span>优先级</span>
                <span>类型</span>
                <span>标的</span>
                <span>触发条件 / 描述</span>
                <span>参考价格 / 金额</span>
                <span>计划状态</span>
                <span>操作</span>
              </div>
              {visibleActions.map((item) => (
                <div className="action-table-row" key={item.id}>
                  <span className={`priority priority--${item.priority}`}>
                    {item.priority === 'high' ? '高' : item.priority === 'medium' ? '中' : '低'}
                  </span>
                  <span className={`action-type action-type--${item.category}`}>
                    <WarningOutlined />
                    {item.type}
                  </span>
                  <span className="security-name">
                    <strong>{item.symbol}</strong>
                    <small>{item.code}</small>
                  </span>
                  <span className="action-description" title={item.description}>
                    {item.description}
                  </span>
                  <span className="market-price">
                    <strong>{item.price}</strong>
                    <small>{item.change}</small>
                  </span>
                  <Tag color={item.statusTone === 'success' ? 'success' : 'warning'}>{item.status}</Tag>
                  <Button size="small" className="queue-action-button" onClick={() => void handleAction(item)}>
                    {item.action}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CommandPanel>

        <CommandPanel className="home-tools-panel" number="2." title="交易工作流" meta="常用入口">
          <div className="home-tools">
            {[
              {
                title: '持仓中心',
                detail: '查看持仓与收益，记录每笔成交',
                path: routePaths.positions,
                icon: <ProjectOutlined />,
              },
              { title: '计划工作台', detail: '跟进等待入场与持仓中的计划', path: routePaths.plans, icon: <PlusOutlined /> },
              { title: '交易日记', detail: '整理交易逻辑，完成待办复盘', path: routePaths.journal, icon: <ImportOutlined /> },
              {
                title: '交易规则',
                detail: '执行前检查，持续完善交易纪律',
                path: routePaths.playbook,
                icon: <SafetyCertificateOutlined />,
              },
            ].map((item) => (
              <button type="button" key={item.path} onClick={() => void navigate(item.path)}>
                {item.icon}
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </span>
                <RightOutlined />
              </button>
            ))}
          </div>
        </CommandPanel>

        <CommandPanel className="watch-panel" number="3." title="观察清单">
          {lofPreview.length > 0 ? (
            <div className="lof-home-preview">
              <div className="lof-home-preview__head">
                <strong>LOF 套利机会</strong>
                <Button size="small" onClick={() => void navigate(routePaths.lofArbitrage)}>
                  打开监控 <RightOutlined />
                </Button>
              </div>
              {lofPreview.map((row) => (
                <div className="watch-row" key={`lof-${row.symbol}`}>
                  <span>
                    <b>{row.symbol}</b> {row.name}
                  </span>
                  <span>
                    <ValueDisplay kind={priceListPresetForKind('lof')} value={row.marketPrice} />
                  </span>
                  <span>
                    <ValueDisplay kind="percent" value={row.premiumRate} />
                  </span>
                  <span>{summarizeActionHint(row.premiumRate, row.feasiblePaths, row.recommendedPath)}</span>
                </div>
              ))}
            </div>
          ) : null}
          <div className="watch-table">
            <div className="watch-head">
              <span>标的</span>
              <span>最新价</span>
              <span>涨跌幅</span>
              <span>定位 / 股息率</span>
            </div>
            {overlapLoading ? (
              <div className="watch-row watch-row--loading">
                <Skeleton active paragraph={{ rows: 2 }} title={false} />
              </div>
            ) : overlapPreview.length === 0 ? (
              <div className="watch-row watch-row--empty">
                <small>交集观察池暂不可用，请前往自选观察池查看。</small>
              </div>
            ) : (
              overlapPreview.map((row) => {
                const change = row.quote?.changePercent;
                const yieldText =
                  row.liveYieldPercent !== null && row.liveYieldPercent !== undefined
                    ? `股息 ${row.liveYieldPercent.toFixed(2)}%`
                    : row.referenceYieldPercent !== null
                      ? `参考股息 ${row.referenceYieldPercent.toFixed(2)}%`
                      : row.positioning;
                return (
                  <div className="watch-row" key={row.symbol}>
                    <span>
                      <strong>{row.name}</strong>
                      <small>{row.symbol}</small>
                    </span>
                    <b>{row.quote?.price === null || row.quote?.price === undefined ? '—' : formatPrice(row.quote.price)}</b>
                    <ValueDisplay as="b" kind="percent" value={change} />
                    <small>{yieldText}</small>
                  </div>
                );
              })
            )}
          </div>
          <div className="watch-footer">
            <button type="button" onClick={() => void navigate(routePaths.watchlist)}>
              打开自选股 <RightOutlined />
            </button>
            <button type="button" onClick={() => setNewPlanOpen(true)}>
              新建计划 <PlusOutlined />
            </button>
          </div>
        </CommandPanel>
      </div>

      <PlanCreateModal
        open={newPlanOpen}
        onClose={() => setNewPlanOpen(false)}
        onSaved={(plan) => {
          setNewPlanOpen(false);
          void invalidateWorkspaceData();
          void message.success(plan.status === 'watching' ? '计划已创建并进入监控' : '计划已保存为草稿');
        }}
      />
    </main>
  );
}
