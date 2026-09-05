import {
  CheckCircleFilled,
  CloudSyncOutlined,
  DatabaseOutlined,
  ImportOutlined,
  NotificationOutlined,
  PlusOutlined,
  ProjectOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  StarFilled,
  WarningOutlined,
} from '@ant-design/icons';
import { App, Button, Progress, Skeleton } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { TradeAlert } from '../../shared/api.types';
import { summarizeActionHint } from '../../shared/lof-arbitrage/action-hint';
import { CommandPanel } from '../components/home/CommandPanel';
import { previewActionItems, ruleRows, stageColumns, timelineSteps } from '../components/home/home-preview-data';
import type { ActionItem, QueueCategory } from '../components/home/types';
import { PlanCreateModal } from '../components/trading/PlanCreateModal';
import { formatAlertCondition, formatCurrency, formatPrice, ValueDisplay } from '../lib/trading-format';
import { priceListPresetForKind } from '../../shared/format/display-presets';
import { invalidateWorkspaceData, useHomeLofPreviewQuery, useHomeOverlapPoolQuery, useWorkspaceSnapshot } from '../lib/queries';
import { routePaths } from '../router/paths';

export function HomePage(): React.JSX.Element {
  const { message } = App.useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const { snapshot, isLoading: loading } = useWorkspaceSnapshot();
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
    return [...alerts, ...sipDue, ...episodeReviews, ...plans, ...planReviews].slice(0, 6);
  }, [snapshot]);

  const actionItems = realActionItems.length ? realActionItems : previewActionItems;
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

  const reviewPnl = snapshot?.reviewedTradeCount ? (snapshot.totalPnl ?? 0) : 8742.3;

  return (
    <div className="command-dashboard">
      <header className="command-welcome">
        <div>
          <h1>今日指挥台</h1>
          <p>聚焦下一步行动，按计划执行并沉淀每一次交易决策。</p>
        </div>
        <div className="command-welcome-status" role="status" aria-live="polite">
          <span>
            <i /> 本地数据已就绪
          </span>
          <strong>{actionItems.length} 项待处理</strong>
        </div>
      </header>
      <div className="command-grid">
        <CommandPanel
          className="queue-panel"
          number="1."
          title="下一步动作 / 今日执行队列"
          meta={`(${actionItems.length})`}
          extra={<SettingOutlined />}
        >
          <div className="queue-tabs" role="tablist" aria-label="行动队列筛选">
            {(
              [
                ['all', '全部', actionItems.length],
                ['reminder', '触发提醒', actionItems.filter((item) => item.category === 'reminder').length],
                ['due', '计划到期', actionItems.filter((item) => item.category === 'due').length],
                ['review', '待复盘', actionItems.filter((item) => item.category === 'review').length],
                ['risk', '风险预警', actionItems.filter((item) => item.category === 'risk').length],
              ] as const
            ).map(([key, label, count]) => (
              <button className={queueFilter === key ? 'active' : ''} key={key} type="button" onClick={() => setQueueFilter(key)}>
                {label} <span>{count}</span>
              </button>
            ))}
          </div>
          <div className="action-table">
            <div className="action-table-head">
              <span>优先级</span>
              <span>类型</span>
              <span>标的</span>
              <span>触发条件 / 描述</span>
              <span>现价</span>
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
                  <small className={item.change.startsWith('-') ? 'market-down' : 'market-up'}>{item.change}</small>
                </span>
                <span className={`status-pill status-pill--${item.statusTone}`}>{item.status}</span>
                <Button size="small" className="row-action-button" onClick={() => void handleAction(item)}>
                  {item.action}
                </Button>
              </div>
            ))}
          </div>
          <button className="panel-footer-link" type="button" onClick={() => void navigate(routePaths.plans)}>
            查看全部队列 <RightOutlined />
          </button>
        </CommandPanel>

        <CommandPanel
          className="stage-panel"
          number="2."
          title="计划阶段看板"
          meta="(总计 28)"
          extra={
            <button type="button" onClick={() => void navigate(routePaths.plans)}>
              查看全部计划 <RightOutlined />
            </button>
          }
        >
          <div className="stage-board">
            {stageColumns.map((column) => (
              <button
                className={`stage-column stage-column--${column.tone}`}
                key={column.title}
                type="button"
                onClick={() => void navigate(routePaths.plans)}
              >
                <span className="stage-heading">
                  <b>{column.title}</b>
                  <strong>{column.count}</strong>
                </span>
                {column.items.map(([name, detail]) => (
                  <span className="stage-card" key={`${name}-${detail}`}>
                    <b>{name}</b>
                    <small>{detail}</small>
                  </span>
                ))}
                <span className="stage-more">+{Math.max(column.count - 3, 2)} 更多</span>
              </button>
            ))}
          </div>
        </CommandPanel>

        <CommandPanel
          className="timeline-panel"
          number="3."
          title="交易回合时间线"
          meta="(腾讯控股 0700.HK)"
          extra={
            <span className="timeline-id">
              回合ID：EP20250512002 <b>已完成</b>
            </span>
          }
        >
          <div className="trade-timeline">
            {timelineSteps.map((step) => (
              <div className="timeline-step" key={step.label}>
                <span className="timeline-icon">{step.icon}</span>
                <strong>{step.label}</strong>
                <time>{step.date}</time>
                <span className="timeline-detail">
                  {step.details.map((detail) => (
                    <small key={detail}>{detail}</small>
                  ))}
                </span>
              </div>
            ))}
          </div>
          <div className="timeline-result">
            <span>
              回合结果：<strong>盈利 +3,740.00 HKD (+1.89%)</strong>
            </span>
            <span>最大回撤 -1.12% · 持有周期 3天</span>
            <Button size="small" onClick={() => void navigate(routePaths.journal)}>
              查看回合详情
            </Button>
          </div>
        </CommandPanel>

        <CommandPanel className="risk-panel" number="4." title="账户与风险预算">
          <div className="risk-balance">
            <span>账户净值（CNY）</span>
            <strong>512,340.60</strong>
            <small>
              本周 <b>+8,742.30 · +1.74%</b>
            </small>
            <div className="equity-trend">
              <span>净值趋势</span>
              <Progress percent={78} showInfo={false} size="small" />
            </div>
          </div>
          <div className="risk-stat-row">
            <span>
              可用资金<strong>126,340.60</strong>
            </span>
            <span>
              当日盈亏<strong className="market-up">+4,230.50</strong>
            </span>
            <span>
              风险预算（单笔）<strong>10,246.81</strong>
              <small>账户净值 2.0%</small>
            </span>
          </div>
          <div className="risk-bottom">
            <Progress
              type="circle"
              percent={63}
              size={78}
              strokeColor="#f5a623"
              railColor="#274055"
              format={(percent) => (
                <span className="risk-gauge-value">
                  {percent}%<small>中等</small>
                </span>
              )}
            />
            <div className="risk-notes">
              <span>
                组合风险敞口<strong>63%</strong>
              </span>
              <span>
                最大单一标的占比<strong>22.6%</strong>
              </span>
              <span>
                行业集中度（前3）<strong>48.3%</strong>
              </span>
              <span>
                最大回撤（本月）<strong>-3.21%</strong>
              </span>
            </div>
          </div>
        </CommandPanel>

        <CommandPanel
          className="review-panel"
          number="5."
          title="本周复盘摘要"
          meta="(05.12 - 05.16)"
          extra={
            <button type="button" onClick={() => void navigate(routePaths.journal)}>
              查看全部计划 <RightOutlined />
            </button>
          }
        >
          <div className="review-progress">
            <span>
              复盘完成率 <strong>72%</strong> 13 / 18
            </span>
            <Progress percent={72} showInfo={false} size="small" />
            <Button size="small" onClick={() => void navigate(routePaths.journal)}>
              查看全部复盘
            </Button>
          </div>
          <div className="review-top-list">
            <div>
              <strong className="market-closed">重复出现的错误 TOP3</strong>
              <span>
                <WarningOutlined />
                止损执行不坚决 <b>4次</b>
              </span>
              <span>
                <WarningOutlined />
                过早止盈 <b>3次</b>
              </span>
              <span>
                <WarningOutlined />
                未按计划减仓 <b>2次</b>
              </span>
            </div>
            <div>
              <strong className="market-open">最佳行为 TOP3</strong>
              <span>
                <CheckCircleFilled />
                按计划分批建仓 <b>5次</b>
              </span>
              <span>
                <CheckCircleFilled />
                严格执行止损 <b>4次</b>
              </span>
              <span>
                <CheckCircleFilled />
                复盘记录完整 <b>4次</b>
              </span>
            </div>
          </div>
          <div className="review-metrics">
            <span>
              本周净盈亏
              <ValueDisplay as="strong" kind="pnl" value={reviewPnl} />
              <small>(+1.74%)</small>
            </span>
            <span>
              平均 R 倍数<strong className="market-up">+0.42R</strong>
            </span>
            <span>
              胜率<strong>61.5%</strong>
            </span>
            <Button className="rule-button" icon={<ProjectOutlined />} onClick={() => void navigate(routePaths.analysis)}>
              转为规则 (3)
            </Button>
          </div>
        </CommandPanel>

        <CommandPanel
          className="rules-panel"
          number="6."
          title="规则检查面板"
          meta="(交易前自检)"
          extra={<span>全部通过可提交订单</span>}
        >
          <div className="rules-table">
            {ruleRows.map(([name, detail, status], index) => (
              <div className="rule-row" key={name}>
                <span>{index + 1}</span>
                <strong>{name}</strong>
                <small>{detail}</small>
                <b className={status === '通过' ? 'market-open' : 'rule-warning'}>
                  {status} {status === '通过' ? <CheckCircleFilled /> : <WarningOutlined />}
                </b>
              </div>
            ))}
          </div>
          <button
            className="panel-footer-link panel-footer-link--right"
            type="button"
            onClick={() => void navigate(routePaths.analysis)}
          >
            管理规则 <RightOutlined />
          </button>
        </CommandPanel>

        <CommandPanel className="watch-panel" number="7." title="观察清单">
          {lofPreview.length > 0 ? (
            <div className="lof-home-preview">
              <div className="lof-home-preview__head">
                <strong>LOF 套利机会</strong>
                <button type="button" onClick={() => void navigate(routePaths.lofArbitrage)}>
                  打开监控 <RightOutlined />
                </button>
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
              <span>关注度</span>
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
                    <span className="watch-stars">
                      {Array.from({ length: 5 }, (_, index) => (
                        <StarFilled className={index < 5 ? 'active' : ''} key={index} />
                      ))}
                    </span>
                  </div>
                );
              })
            )}
          </div>
          <div className="watch-footer">
            <button type="button" onClick={() => void navigate(routePaths.watchlist)}>
              打开自选观察池 <RightOutlined />
            </button>
            <button type="button" onClick={() => setNewPlanOpen(true)}>
              添加标的 <PlusOutlined />
            </button>
          </div>
        </CommandPanel>

        <CommandPanel className="system-panel" number="8." title="数据状态">
          <div className="system-list">
            <span>
              <CloudSyncOutlined />
              <b>行情源</b>
              <strong>同花顺（主）</strong>
              <i />
              连接正常<time>09:45:12</time>
            </span>
            <span>
              <NotificationOutlined />
              <b>通知服务</b>
              <strong>企业微信</strong>
              <i />
              连接正常
            </span>
            <span>
              <ImportOutlined />
              <b>CSV 导入</b>
              <strong>成交记录.csv</strong>
              <i />
              最新<time>09:31</time>
            </span>
            <span>
              <DatabaseOutlined />
              <b>离线缓存</b>
              <strong>本地数据库</strong>
              <i />
              已同步<time>09:45</time>
            </span>
          </div>
          <div className="system-footer">
            <span>上次完整备份 · 2025-05-15 22:30</span>
            <Button size="small" icon={<SafetyCertificateOutlined />} onClick={() => void navigate(routePaths.settings)}>
              立即备份
            </Button>
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
    </div>
  );
}
