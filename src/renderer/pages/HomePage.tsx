import {
  BellOutlined,
  CheckCircleFilled,
  CheckOutlined,
  CloudSyncOutlined,
  DatabaseOutlined,
  ExportOutlined,
  FileAddOutlined,
  ImportOutlined,
  MinusOutlined,
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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { OverlapPoolItemLive, TradeAlert, TradeEpisodeView, TradingPlan, WorkspaceSnapshot } from '../../shared/api.types';
import { PlanCreateModal } from '../components/trading/PlanCreateModal';
import { formatAlertCondition, formatCurrency, formatPrice } from '../lib/trading-format';
import { routePaths } from '../router/paths';

type QueueCategory = 'all' | 'reminder' | 'due' | 'review' | 'risk';

interface ActionItem {
  id: string;
  priority: 'high' | 'medium' | 'low';
  category: Exclude<QueueCategory, 'all'>;
  type: string;
  symbol: string;
  code: string;
  description: string;
  price: string;
  change: string;
  status: string;
  statusTone: 'warning' | 'success' | 'violet' | 'blue';
  action: string;
  source?: TradingPlan | TradeAlert | TradeEpisodeView;
}

const previewActionItems: ActionItem[] = [
  {
    id: 'preview-1',
    priority: 'high',
    category: 'reminder',
    type: '触发提醒',
    symbol: '宁德时代',
    code: '300750',
    description: '突破 240.00，放量站上20日均线',
    price: '241.36',
    change: '+1.21%',
    status: '等待入场',
    statusTone: 'warning',
    action: '查看计划',
  },
  {
    id: 'preview-2',
    priority: 'high',
    category: 'risk',
    type: '风险预警',
    symbol: '沪深300ETF',
    code: '510300',
    description: '回撤 > 2.5%，触发风控',
    price: '3.512',
    change: '-0.79%',
    status: '持仓中',
    statusTone: 'success',
    action: '处理预警',
  },
  {
    id: 'preview-3',
    priority: 'medium',
    category: 'due',
    type: '计划到期',
    symbol: '贵州茅台',
    code: '600519',
    description: '计划有效期将于 1 天后到期',
    price: '1,618.00',
    change: '-0.37%',
    status: '等待入场',
    statusTone: 'warning',
    action: '延长计划',
  },
  {
    id: 'preview-4',
    priority: 'medium',
    category: 'review',
    type: '待复盘',
    symbol: '腾讯控股',
    code: '0700.HK',
    description: '交易回合已结束，等待复盘',
    price: '375.60',
    change: '-0.53%',
    status: '已完成',
    statusTone: 'success',
    action: '开始复盘',
  },
  {
    id: 'preview-5',
    priority: 'low',
    category: 'reminder',
    type: '触发提醒',
    symbol: '中国平安',
    code: '601318',
    description: '回踩 55.80 附近，关注支撑',
    price: '55.96',
    change: '+0.27%',
    status: '观察中',
    statusTone: 'violet',
    action: '查看计划',
  },
];

const stageColumns = [
  {
    title: '观察中',
    count: 6,
    tone: 'blue',
    items: [
      ['宁德时代', '关注突破 240'],
      ['中国平安', '观察支撑 55.8'],
      ['美团-W', '等待回调机会'],
    ],
  },
  {
    title: '等待入场',
    count: 7,
    tone: 'orange',
    items: [
      ['宁德时代', '突破 240 入场'],
      ['贵州茅台', '回踩 1610 附近'],
      ['比亚迪', '站上 240 入场'],
    ],
  },
  {
    title: '持仓中',
    count: 5,
    tone: 'green',
    items: [
      ['沪深300ETF', '成本 3.502'],
      ['腾讯控股', '成本 368.20'],
      ['中国平安', '成本 54.80'],
    ],
  },
  {
    title: '等待退出',
    count: 4,
    tone: 'violet',
    items: [
      ['腾讯控股', '目标 400 附近'],
      ['贵州茅台', '目标 1750'],
      ['中国平安', '上移止损'],
    ],
  },
  {
    title: '已完成',
    count: 6,
    tone: 'slate',
    items: [
      ['比亚迪', '止盈达成'],
      ['洋河股份', '止损离场'],
      ['招商银行', '止盈达成'],
    ],
  },
] as const;

const timelineSteps = [
  { label: '计划创建', date: '05-08 21:30', icon: <FileAddOutlined />, details: ['突破 365', '入场计划', '仓位计划 20%'] },
  { label: '提醒触发', date: '05-12 09:35', icon: <BellOutlined />, details: ['突破 366', '成交放量', '提醒确认'] },
  { label: '买入', date: '05-12 09:41', icon: <ImportOutlined />, details: ['价格 368.20', '数量 2,000', '仓位 20%'] },
  { label: '加仓', date: '05-12 10:15', icon: <PlusOutlined />, details: ['价格 371.60', '数量 1,000', '仓位 30%'] },
  { label: '减仓', date: '05-14 10:02', icon: <MinusOutlined />, details: ['价格 382.00', '数量 1,000', '仓位 20%'] },
  { label: '卖出', date: '05-15 14:28', icon: <ExportOutlined />, details: ['价格 375.60', '数量 2,000', '仓位 0%'] },
  { label: '复盘完成', date: '05-16 10:20', icon: <CheckOutlined />, details: ['评分 72/100', '盈亏 +1.69%', 'R倍数 +0.63R'] },
] as const;

const ruleRows = [
  ['计划优先原则', '必须存在有效计划，且条件已触发', '通过'],
  ['风险收益比 ≥ 1.5', '当前计划盈亏比 1.82', '通过'],
  ['单笔风险 ≤ 2%', '预计风险 1.48%（¥7,580）', '通过'],
  ['仓位符合计划', '计划仓位 20%，当前拟下单 20%', '通过'],
  ['市场环境过滤', '大盘趋势向上，量能正常', '量能较昨日下降 18%'],
] as const;

function formatChangePercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(2)}%`;
}

export function HomePage(): React.JSX.Element {
  const { message } = App.useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [newPlanOpen, setNewPlanOpen] = useState(() => Boolean((location.state as { newPlan?: boolean } | null)?.newPlan));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queueFilter, setQueueFilter] = useState<QueueCategory>('all');
  const [overlapPreview, setOverlapPreview] = useState<OverlapPoolItemLive[]>([]);
  const [overlapLoading, setOverlapLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      setSnapshot(await window.desktop.workspace.snapshot());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '工作台读取失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void window.desktop.workspace
      .snapshot()
      .then((next) => {
        if (active) setSnapshot(next);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : '工作台读取失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void window.desktop.watchlist
      .getPoolSnapshot('overlap')
      .then((snapshot) => {
        if (active && snapshot.poolId === 'overlap') setOverlapPreview(snapshot.items);
      })
      .catch(() => {
        if (active) setOverlapPreview([]);
      })
      .finally(() => {
        if (active) setOverlapLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

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
    return [...alerts, ...episodeReviews, ...plans, ...planReviews].slice(0, 5);
  }, [snapshot]);

  const actionItems = realActionItems.length ? realActionItems : previewActionItems;
  const visibleActions = queueFilter === 'all' ? actionItems : actionItems.filter((item) => item.category === queueFilter);

  const completeAlert = async (alert: TradeAlert): Promise<void> => {
    try {
      await window.desktop.alerts.setStatus(alert.id, 'completed');
      window.dispatchEvent(new Event('workspace-changed'));
      await load();
      void message.success('提醒已标记为处理完成');
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '提醒处理失败');
    }
  };

  const handleAction = async (item: ActionItem): Promise<void> => {
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
        window.dispatchEvent(new Event('workspace-changed'));
        await load();
        if (nextStatus === 'completed') void navigate(routePaths.journal, { state: { planId: item.source.id } });
        else void message.success('已确认入场，风险提醒开始监控');
        return;
      }
    }
    void navigate(
      item.category === 'review' ? routePaths.journal : item.category === 'reminder' ? routePaths.alerts : routePaths.plans,
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
      {error ? <div className="page-error command-error">{error}</div> : null}
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
              本周净盈亏<strong className={reviewPnl >= 0 ? 'market-up' : 'market-down'}>{formatCurrency(reviewPnl)}</strong>
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
                const changeText = formatChangePercent(change);
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
                    <b className={change !== null && change !== undefined && change < 0 ? 'market-down' : 'market-up'}>
                      {changeText}
                    </b>
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
          window.dispatchEvent(new Event('workspace-changed'));
          void load();
          void message.success(plan.status === 'watching' ? '计划已创建并进入监控' : '计划已保存为草稿');
        }}
      />
    </div>
  );
}

interface CommandPanelProps {
  number: string;
  title: string;
  meta?: string;
  extra?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

function CommandPanel({ number, title, meta, extra, className = '', children }: CommandPanelProps): React.JSX.Element {
  return (
    <section className={`command-panel ${className}`}>
      <header className="command-panel-header">
        <h2>
          <span>{number}</span> {title} {meta ? <small>{meta}</small> : null}
        </h2>
        {extra ? <div className="command-panel-extra">{extra}</div> : null}
      </header>
      <div className="command-panel-body">{children}</div>
    </section>
  );
}
