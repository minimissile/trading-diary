import { CheckOutlined, DeleteOutlined, MoreOutlined, PauseOutlined, PlayCircleOutlined, PlusOutlined, StopOutlined, UploadOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Calendar,
  Drawer,
  Dropdown,
  Empty,
  Modal,
  Segmented,
  Skeleton,
  Table,
  Tag,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type {
  FundSipOccurrenceView,
  FundSipPlanDetailView,
  FundSipPlanView,
  SipOccurrenceCalendarDay,
  SipPlanStatus,
} from '../../shared/sip/types';
import { SipConfirmModal } from '../components/trading/SipConfirmModal';
import { SipCreateModal } from '../components/trading/SipCreateModal';
import { SipImportModal } from '../components/trading/SipImportModal';
import { SipPauseModal } from '../components/trading/SipPauseModal';
import { SipReviewModal } from '../components/trading/SipReviewModal';
import { useTradingAccountId } from '../hooks/useTradingAccountId';
import { invalidateWorkspaceData, usePrefetchSipPlan, useSipDashboardQuery } from '../lib/queries';
import type { SipLocationState } from '../router/sip-state';
import { routePaths } from '../router/paths';
import { quantityPresetForKind } from '../../shared/format/display-presets';
import {
  formatSipSchedule,
  sipFrequencyLabels,
  sipOccurrenceStatusLabels,
  sipPlanStatusColors,
  sipPlanStatusLabels,
  ValueDisplay,
} from '../lib/trading-format';

type SipTab = 'due' | 'plans' | 'calendar' | 'history';

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const occurrenceStatusColors: Record<string, string> = {
  scheduled: 'default',
  due: 'orange',
  completed: 'green',
  skipped: 'gold',
  missed: 'red',
};

/**
 * 基金定投页面，管理计划、期次与扣款确认。
 */
export function SipPage(): React.JSX.Element {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [accountId] = useTradingAccountId();
  const [tab, setTab] = useState<SipTab>('plans');
  const [filter, setFilter] = useState<'all' | SipPlanStatus>('active');
  const [calendarMonth, setCalendarMonth] = useState(currentMonth());
  const { data, isLoading: loading, refetch } = useSipDashboardQuery(calendarMonth);
  const prefetchSipPlan = usePrefetchSipPlan();
  const plans = data?.plans ?? [];
  const summary = data?.summary ?? null;
  const dueOccurrences = data?.dueOccurrences ?? [];
  const historyOccurrences = data?.historyOccurrences ?? [];
  const calendarDays = data?.calendarDays ?? [];
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [reviewPlanId, setReviewPlanId] = useState<string | null>(null);
  const [highlightSymbol, setHighlightSymbol] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<FundSipOccurrenceView | null>(null);
  const [pauseTarget, setPauseTarget] = useState<FundSipPlanView | null>(null);
  const [detailPlan, setDetailPlan] = useState<FundSipPlanDetailView | null>(null);

  useEffect(() => {
    const state = location.state as SipLocationState | null;
    if (!state?.confirmOccurrenceId && !state?.highlightSymbol && !state?.openPlanId) return;

    if (state.highlightSymbol) {
      setHighlightSymbol(state.highlightSymbol);
      setTab('plans');
    }
    if (state.openPlanId) {
      void prefetchSipPlan(state.openPlanId).then((plan) => setDetailPlan(plan)).catch(() => undefined);
      setTab('plans');
    }

    const targetId = state.confirmOccurrenceId;
    if (targetId) {
      const target =
        dueOccurrences.find((item) => item.id === targetId) ??
        historyOccurrences.find((item) => item.id === targetId);
      if (target) {
        setConfirmTarget(target);
        setTab('due');
      }
    }
    void navigate(location.pathname, { replace: true, state: null });
  }, [dueOccurrences, historyOccurrences, location.pathname, location.state, navigate]);

  const visiblePlans = useMemo(() => {
    const scoped = filter === 'all' ? plans : plans.filter((plan) => plan.status === filter);
    if (!highlightSymbol) return scoped;
    return scoped.filter((plan) => plan.symbol === highlightSymbol);
  }, [filter, highlightSymbol, plans]);

  const activePlanCount = useMemo(() => plans.filter((plan) => plan.status === 'active').length, [plans]);

  const calendarCellMap = useMemo(() => {
    type CalendarItem = SipOccurrenceCalendarDay['items'][number];
    const map = new Map<string, CalendarItem[]>();
    for (const day of calendarDays) map.set(day.date, day.items);
    return map;
  }, [calendarDays]);

  const openPlanDetail = async (planId: string): Promise<void> => {
    try {
      setDetailPlan(await window.desktop.sip.getPlan(planId));
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '计划详情读取失败');
    }
  };

  const deletePlan = (plan: FundSipPlanView): void => {
    Modal.confirm({
      title: '删除定投计划',
      content:
        plan.status === 'active'
          ? '计划仍在执行中。删除后将移除全部期次记录；已写入持仓的流水不会删除。'
          : plan.completedCount > 0
            ? `将删除计划及 ${plan.completedCount} 条期次记录；已确认扣款流水仍保留在持仓中。`
            : '删除后无法恢复，确定删除该计划？',
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await window.desktop.sip.delete(plan.id);
          if (detailPlan?.id === plan.id) setDetailPlan(null);
          await invalidateWorkspaceData();
          await refetch();
          void message.success('计划已删除');
        } catch (reason) {
          void message.error(reason instanceof Error ? reason.message : '删除失败');
        }
      },
    });
  };

  const cancelScheduledPause = async (plan: FundSipPlanView): Promise<void> => {
    try {
      await window.desktop.sip.cancelScheduledPause(plan.id);
      await invalidateWorkspaceData();
      await refetch();
      if (detailPlan?.id === plan.id) await openPlanDetail(plan.id);
      void message.success('已取消预约暂停');
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '取消预约失败');
    }
  };

  const setStatus = async (plan: FundSipPlanView, status: SipPlanStatus): Promise<void> => {
    try {
      await window.desktop.sip.setStatus(plan.id, status);
      await invalidateWorkspaceData();
      await refetch();
      if (detailPlan?.id === plan.id) await openPlanDetail(plan.id);
      void message.success('计划状态已更新');
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '状态更新失败');
    }
  };

  const skipOccurrence = (occurrence: FundSipOccurrenceView): void => {
    Modal.confirm({
      title: '跳过本期扣款',
      content: '请说明跳过原因，便于后续复盘纪律。',
      okText: '确认跳过',
      onOk: async () => {
        await window.desktop.sip.skipOccurrence(occurrence.id, '用户主动跳过');
        await invalidateWorkspaceData();
        await refetch();
        void message.success('本期已标记为跳过');
      },
    });
  };

  const buildOccurrenceActionItems = (occurrence: FundSipOccurrenceView): MenuProps['items'] => [
    {
      key: 'confirm',
      label: '确认扣款',
      icon: <CheckOutlined />,
      onClick: () => setConfirmTarget(occurrence),
    },
    {
      key: 'skip',
      label: '跳过',
      icon: <StopOutlined />,
      onClick: () => skipOccurrence(occurrence),
    },
  ];

  const buildPlanActionItems = (plan: FundSipPlanView): MenuProps['items'] => {
    const items: MenuProps['items'] = [];
    const today = new Date().toISOString().slice(0, 10);
    const hasScheduledPause =
      plan.status === 'active' && plan.pauseFromDate !== null && plan.pauseFromDate > today;

    if (plan.status === 'draft') {
      items.push({
        key: 'activate',
        label: '启用',
        icon: <PlayCircleOutlined />,
        onClick: () => void setStatus(plan, 'active'),
      });
    }
    if (plan.status === 'active' || plan.status === 'paused') {
      items.push({
        key: 'pause',
        label:
          plan.status === 'paused'
            ? '调整暂停日'
            : hasScheduledPause
              ? '修改暂停日期'
              : '暂停',
        icon: <PauseOutlined />,
        onClick: () => setPauseTarget(plan),
      });
      if (hasScheduledPause) {
        items.push({
          key: 'cancel-pause',
          label: '取消预约暂停',
          onClick: () => void cancelScheduledPause(plan),
        });
      }
    }
    if (plan.status === 'paused') {
      items.push({
        key: 'resume',
        label: '恢复',
        icon: <PlayCircleOutlined />,
        onClick: () => void setStatus(plan, 'active'),
      });
    }
    if (plan.status === 'active' || plan.status === 'paused') {
      items.push({
        key: 'cancel',
        label: '终止',
        icon: <StopOutlined />,
        onClick: () => void setStatus(plan, 'cancelled'),
      });
    }
    items.push({
      key: 'delete',
      label: '删除',
      icon: <DeleteOutlined />,
      danger: true,
      onClick: () => deletePlan(plan),
    });

    return items;
  };

  const renderActionMenu = (items: MenuProps['items']): React.JSX.Element | null => {
    if (!items?.length) return null;
    return (
      <Dropdown trigger={['click']} menu={{ items }}>
        <Button type="text" size="small" icon={<MoreOutlined />} aria-label="操作菜单" />
      </Dropdown>
    );
  };

  const dueColumns = useMemo<ColumnsType<FundSipOccurrenceView>>(
    () => [
      {
        title: '计划',
        key: 'plan',
        render: (_, row) => (
          <span className="watchlist-symbol-button">
            <strong>{row.planName}</strong>
            <small>{row.symbol}</small>
          </span>
        ),
      },
      { title: '扣款日', dataIndex: 'scheduledDate', width: 120 },
      {
        title: '计划金额',
        width: 110,
        align: 'right',
        render: (_, row) => <ValueDisplay kind="currency" value={row.plannedAmount} />,
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 88,
        render: (status: keyof typeof sipOccurrenceStatusLabels) => (
          <Tag color={occurrenceStatusColors[status]}>{sipOccurrenceStatusLabels[status]}</Tag>
        ),
      },
      {
        title: '操作',
        key: 'actions',
        width: 64,
        fixed: 'right',
        align: 'center',
        render: (_, row) => renderActionMenu(buildOccurrenceActionItems(row)),
      },
    ],
    [],
  );

  const planColumns = useMemo<ColumnsType<FundSipPlanView>>(
    () => [
      {
        title: '计划',
        key: 'name',
        render: (_, row) => (
          <button className="link-button watchlist-symbol-button" type="button" onClick={() => void openPlanDetail(row.id)}>
            <strong>{row.name}</strong>
            <small>
              {row.symbol} · {sipFrequencyLabels[row.frequency]} · {formatSipSchedule(row)}
            </small>
          </button>
        ),
      },
      {
        title: '每期',
        dataIndex: 'amount',
        width: 100,
        align: 'right',
        render: (value: number) => <ValueDisplay kind="currency" value={value} />,
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 132,
        render: (_, row) => {
          const today = new Date().toISOString().slice(0, 10);
          const scheduledPause =
            row.status === 'active' && row.pauseFromDate !== null && row.pauseFromDate > today;
          return (
            <span className="sip-plan-status-tags">
              <Tag color={sipPlanStatusColors[row.status]}>{sipPlanStatusLabels[row.status]}</Tag>
              {scheduledPause ? <Tag color="orange">{row.pauseFromDate} 起暂停</Tag> : null}
            </span>
          );
        },
      },
      {
        title: '连续完成',
        dataIndex: 'currentStreak',
        width: 96,
        align: 'right',
        render: (value: number) => `${value} 期`,
      },
      {
        title: '纪律率',
        key: 'discipline',
        width: 88,
        align: 'right',
        render: (_, row) =>
          row.disciplineRate === null ? '—' : `${Math.round(row.disciplineRate * 100)}%`,
      },
      {
        title: '待执行',
        dataIndex: 'dueCount',
        width: 80,
        align: 'right',
      },
      {
        title: '操作',
        key: 'actions',
        width: 64,
        fixed: 'right',
        align: 'center',
        render: (_, row) => renderActionMenu(buildPlanActionItems(row)),
      },
    ],
    [],
  );

  const historyColumns = useMemo<ColumnsType<FundSipOccurrenceView>>(
    () => [
      { title: '扣款日', dataIndex: 'scheduledDate', width: 108 },
      {
        title: '计划',
        key: 'plan',
        render: (_, row) => (
          <span>
            <strong>{row.planName}</strong>
            <br />
            <small>{row.symbol}</small>
          </span>
        ),
      },
      {
        title: '金额',
        key: 'amount',
        width: 100,
        align: 'right',
        render: (_, row) => <ValueDisplay kind="currency" value={row.amount ?? row.plannedAmount} />,
      },
      {
        title: '份额',
        dataIndex: 'quantity',
        width: 88,
        align: 'right',
        render: (value: number | null, row) =>
          value === null ? (
            '—'
          ) : (
            <ValueDisplay kind={quantityPresetForKind(row.kind)} value={value} />
          ),
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 88,
        render: (status: keyof typeof sipOccurrenceStatusLabels) => (
          <Tag color={occurrenceStatusColors[status]}>{sipOccurrenceStatusLabels[status]}</Tag>
        ),
      },
      {
        title: '操作',
        key: 'actions',
        width: 64,
        fixed: 'right',
        align: 'center',
        render: (_, row) =>
          row.status === 'due' || row.status === 'scheduled'
            ? renderActionMenu([
                {
                  key: 'confirm',
                  label: '确认扣款',
                  icon: <CheckOutlined />,
                  onClick: () => setConfirmTarget(row),
                },
              ])
            : null,
      },
    ],
    [],
  );

  return (
    <main className="workspace-page portfolio-page sip-page">
      <header className="page-header">
        <div>
          <p className="page-kicker">FUND SIP</p>
          <h1>基金定投</h1>
          <p className="page-intro">按计划提醒扣款，确认后自动写入持仓流水。系统不会代扣或推荐买卖。</p>
        </div>
        <div className="portfolio-header-actions">
          <Button icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>
            导入历史
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新建定投
          </Button>
        </div>
      </header>

      {loading && !summary ? (
        <Skeleton active paragraph={{ rows: 12 }} />
      ) : (
        <>
          <section className="portfolio-metrics sip-metrics">
            <article className="portfolio-metric-card portfolio-metric-card--primary">
              <small>执行中计划</small>
              <strong>{summary?.activePlanCount ?? 0}</strong>
              <span>活跃定投计划</span>
            </article>
            <article className="portfolio-metric-card">
              <small>待确认扣款</small>
              <strong>{summary?.dueOccurrenceCount ?? 0}</strong>
              <span>到期需手动确认</span>
            </article>
            <article className="portfolio-metric-card">
              <small>本月已完成</small>
              <strong>{summary?.completedThisMonth ?? 0}</strong>
              <span>已确认扣款期次</span>
            </article>
            <article className="portfolio-metric-card">
              <small>连续完成</small>
              <strong>{summary?.currentStreak ?? 0}</strong>
              <span>当前连续执行</span>
            </article>
            <article className="portfolio-metric-card">
              <small>最长连续</small>
              <strong>{summary?.longestStreak ?? 0}</strong>
              <span>历史最佳记录</span>
            </article>
            <article className="portfolio-metric-card">
              <small>累计投入</small>
              <ValueDisplay as="strong" kind="currency" value={summary?.totalInvested ?? 0} />
              <span>已确认扣款总额</span>
            </article>
            <article className="portfolio-metric-card">
              <small>纪律率</small>
              <strong>
                {summary?.disciplineRate === null || summary?.disciplineRate === undefined
                  ? '—'
                  : `${Math.round(summary.disciplineRate * 100)}%`}
              </strong>
              <span>完成 / 应执行期次</span>
            </article>
          </section>

          {highlightSymbol ? (
            <div className="sip-filter-banner">
              正在筛选标的 {highlightSymbol}
              <Button type="link" size="small" onClick={() => setHighlightSymbol(null)}>
                清除
              </Button>
            </div>
          ) : null}

          <div className="page-toolbar portfolio-filters sip-page-toolbar">
            <Segmented<SipTab>
              options={[
                { label: `计划 ${plans.length}`, value: 'plans' },
                { label: `待扣款 ${dueOccurrences.length}`, value: 'due' },
                { label: '扣款日历', value: 'calendar' },
                { label: '期次明细', value: 'history' },
              ]}
              value={tab}
              onChange={setTab}
            />
            {tab === 'plans' ? (
              <Segmented
                className="sip-page-toolbar__status"
                options={[
                  { label: `执行中 ${activePlanCount}`, value: 'active' },
                  { label: `全部 ${plans.length}`, value: 'all' },
                  { label: '草稿', value: 'draft' },
                  { label: '已暂停', value: 'paused' },
                ]}
                value={filter}
                onChange={(value) => setFilter(value as 'all' | SipPlanStatus)}
              />
            ) : null}
          </div>

          {tab === 'due' ? (
            dueOccurrences.length === 0 ? (
              <div className="empty-panel">
                <Empty description="暂无到期扣款" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              </div>
            ) : (
              <Table<FundSipOccurrenceView>
                className="watchlist-table"
                rowKey="id"
                columns={dueColumns}
                dataSource={dueOccurrences}
                pagination={false}
                size="small"
                scroll={{ x: 760 }}
              />
            )
          ) : null}

          {tab === 'plans' ? (
            visiblePlans.length === 0 ? (
              <div className="empty-panel">
                <Empty description="还没有定投计划" image={Empty.PRESENTED_IMAGE_SIMPLE}>
                  <Button type="primary" onClick={() => setCreateOpen(true)}>
                    创建第一笔定投
                  </Button>
                </Empty>
              </div>
            ) : (
              <Table<FundSipPlanView>
                className="watchlist-table"
                rowKey="id"
                columns={planColumns}
                dataSource={visiblePlans}
                pagination={{ pageSize: 8 }}
                size="small"
                scroll={{ x: 980 }}
              />
            )
          ) : null}

          {tab === 'calendar' ? (
            <div className="portfolio-calendar-wrap">
              <Calendar
                fullscreen={false}
                onPanelChange={(value) => {
                  const month = `${value.year()}-${String(value.month() + 1).padStart(2, '0')}`;
                  setCalendarMonth(month);
                }}
                cellRender={(current, info) => {
                  if (info.type !== 'date') return info.originNode;
                  const key = current.format('YYYY-MM-DD');
                  const items = calendarCellMap.get(key);
                  if (!items?.length) return null;
                  return (
                    <ul className="portfolio-calendar-cell sip-calendar-cell">
                      {items.slice(0, 2).map((item) => (
                        <li key={item.occurrenceId} className={`sip-calendar-${item.status}`}>
                          {item.planName} <ValueDisplay kind="currency" value={item.amount} />
                        </li>
                      ))}
                      {items.length > 2 ? <li>+{items.length - 2} 笔</li> : null}
                    </ul>
                  );
                }}
              />
            </div>
          ) : null}

          {tab === 'history' ? (
            historyOccurrences.length === 0 ? (
              <div className="empty-panel">
                <Empty description="暂无期次记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              </div>
            ) : (
              <Table<FundSipOccurrenceView>
                className="watchlist-table"
                rowKey="id"
                columns={historyColumns}
                dataSource={historyOccurrences}
                pagination={{ pageSize: 20 }}
                size="small"
                scroll={{ x: 860 }}
              />
            )
          ) : null}
        </>
      )}

      <Drawer
        title={detailPlan?.name ?? '计划详情'}
        open={detailPlan !== null}
        onClose={() => setDetailPlan(null)}
        width={520}
      >
        {detailPlan ? (
          <div className="sip-plan-detail">
            <p>
              <Tag color={sipPlanStatusColors[detailPlan.status]}>{sipPlanStatusLabels[detailPlan.status]}</Tag>
              {detailPlan.status === 'active' &&
              detailPlan.pauseFromDate &&
              detailPlan.pauseFromDate > new Date().toISOString().slice(0, 10) ? (
                <Tag color="orange">{detailPlan.pauseFromDate} 起暂停</Tag>
              ) : null}
              <span>
                {detailPlan.symbol} · {formatSipSchedule(detailPlan)} · 每期{' '}
                <ValueDisplay kind="currency" value={detailPlan.amount} />
              </span>
            </p>
            <p className="sip-plan-thesis">{detailPlan.thesis}</p>
            <div className="sip-plan-stats">
              <span>连续完成 {detailPlan.currentStreak} 期</span>
              <span>
                纪律率{' '}
                {detailPlan.disciplineRate === null ? '—' : `${Math.round(detailPlan.disciplineRate * 100)}%`}
              </span>
            </div>
            <div className="sip-plan-detail-actions">
              <Button size="small" onClick={() => setReviewPlanId(detailPlan.id)}>
                写周期复盘
              </Button>
              <Button
                size="small"
                onClick={() =>
                  navigate(routePaths.positions, {
                    state: { highlightSymbol: detailPlan.symbol, openLedgerSymbol: detailPlan.symbol },
                  })
                }
              >
                查看持仓
              </Button>
              <Button size="small" danger onClick={() => deletePlan(detailPlan)}>
                删除计划
              </Button>
            </div>
            <Table
              className="watchlist-table"
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={detailPlan.occurrences}
              columns={[
                { title: '日期', dataIndex: 'scheduledDate', width: 108 },
                {
                  title: '状态',
                  dataIndex: 'status',
                  render: (status: keyof typeof sipOccurrenceStatusLabels) => sipOccurrenceStatusLabels[status],
                },
                {
                  title: '金额',
                  render: (_, row) => <ValueDisplay kind="currency" value={row.amount ?? detailPlan.amount} />,
                },
              ]}
            />
          </div>
        ) : null}
      </Drawer>

      <SipImportModal
        open={importOpen}
        defaultAccountId={accountId}
        plans={plans}
        onClose={() => setImportOpen(false)}
        onSaved={() => {
          void invalidateWorkspaceData().then(() => refetch());
        }}
      />
      <SipReviewModal
        open={reviewPlanId !== null}
        planId={reviewPlanId}
        onClose={() => setReviewPlanId(null)}
        onSaved={() => {
          void invalidateWorkspaceData();
        }}
      />
      <SipCreateModal
        open={createOpen}
        defaultAccountId={accountId}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          void invalidateWorkspaceData().then(() => refetch());
        }}
      />
      <SipPauseModal
        open={pauseTarget !== null}
        plan={pauseTarget}
        onClose={() => setPauseTarget(null)}
        onSaved={() => {
          void invalidateWorkspaceData().then(() => {
            void refetch();
            if (pauseTarget && detailPlan?.id === pauseTarget.id) void openPlanDetail(pauseTarget.id);
          });
        }}
      />
      <SipConfirmModal
        open={confirmTarget !== null}
        occurrence={confirmTarget}
        onClose={() => setConfirmTarget(null)}
        onSaved={() => {
          void invalidateWorkspaceData().then(() => refetch());
        }}
      />
    </main>
  );
}
