import { useMemo, useState } from 'react';
import { App, Button, Empty, Input, Segmented, Skeleton, Tag } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router';
import type { TradingPlan, TradingPlanStatus } from '../../shared/api.types';
import { PlanCreateModal } from '../components/trading/PlanCreateModal';
import { PlanActivationModal } from '../components/trading/PlanActivationModal';
import { invalidateWorkspaceData, usePlansQuery } from '../lib/queries';
import {
  calculateExpectedR,
  directionLabels,
  formatDateTime,
  formatPrice,
  planStatusColors,
  planStatusLabels,
  ValueDisplay,
} from '../lib/trading-format';
import { withConfirmDefaults } from '../lib/confirm-dialog';
import { routePaths } from '../router/paths';

type PlanFilter = 'all' | 'active' | 'closed' | 'draft' | 'watching' | 'holding';

const executionStages = [
  { status: 'draft', label: '待激活', hint: '完善条件，确认后开始监控' },
  { status: 'watching', label: '待入场', hint: '关注提醒，等待入场条件' },
  { status: 'holding', label: '持仓中', hint: '跟踪风险，结束后复盘' },
] as const;

export function PlansPage(): React.JSX.Element {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const { plans, isLoading: loading, refetch } = usePlansQuery();
  const [filter, setFilter] = useState<PlanFilter>('all');
  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activatingPlan, setActivatingPlan] = useState<TradingPlan | null>(null);

  const stageCounts = useMemo(
    () =>
      Object.fromEntries(executionStages.map(({ status }) => [status, plans.filter((plan) => plan.status === status).length])),
    [plans],
  );
  const visiblePlans = useMemo(
    () =>
      plans.filter((plan) => {
        const matchesStatus =
          filter === 'all' ||
          (filter === 'active'
            ? ['draft', 'watching', 'holding'].includes(plan.status)
            : filter === 'closed'
              ? ['completed', 'cancelled'].includes(plan.status)
              : plan.status === filter);
        const search = query.trim().toLowerCase();
        return matchesStatus && (!search || `${plan.name} ${plan.symbol}`.toLowerCase().includes(search));
      }),
    [filter, plans, query],
  );

  const setStatus = async (plan: TradingPlan, status: TradingPlanStatus): Promise<void> => {
    if (status === 'watching' && plan.status === 'draft') {
      setActivatingPlan(plan);
      return;
    }
    await applyStatus(plan, status);
  };

  const applyStatus = async (plan: TradingPlan, status: TradingPlanStatus): Promise<void> => {
    try {
      await window.desktop.plans.setStatus(plan.id, status);
      await invalidateWorkspaceData();
      await refetch();
      if (status === 'completed') {
        void navigate(routePaths.journal, { state: { planId: plan.id } });
      } else {
        void message.success(
          status === 'watching'
            ? '计划已激活，入场提醒开始监控'
            : status === 'holding'
              ? '已入场，风险提醒开始监控'
              : '计划已取消',
        );
      }
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '计划更新失败');
    }
  };

  return (
    <main className="workspace-page plans-page">
      <header className="page-header">
        <div>
          <p className="page-kicker">PLAYBOOK</p>
          <h1>交易计划</h1>
          <p className="page-intro">先写清入场、失效与风险，再让提醒替你守纪律。</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setDialogOpen(true)}>
          新建计划
        </Button>
      </header>

      <section className="plans-execution" aria-label="计划执行阶段">
        {executionStages.map((stage, index) => (
          <button
            type="button"
            key={stage.status}
            aria-pressed={filter === stage.status}
            className="plans-stage"
            onClick={() => setFilter(filter === stage.status ? 'all' : stage.status)}
          >
            <span className="plans-stage-label">
              <span>0{index + 1}</span>
              {stage.label}
            </span>
            <strong>{loading ? '—' : stageCounts[stage.status]}</strong>
            <small>{stage.hint}</small>
          </button>
        ))}
      </section>
      <section className="plans-library" aria-labelledby="plans-library-title">
        <div className="plans-library-heading">
          <div>
            <h2 id="plans-library-title">
              {executionStages.find((stage) => stage.status === filter)?.label ?? '计划列表'}{' '}
              <span>{loading ? '—' : visiblePlans.length}</span>
            </h2>
            <p>先检查交易条件，再执行下一步</p>
          </div>
          <Input
            className="plans-search"
            prefix={<SearchOutlined />}
            allowClear
            aria-label="搜索计划"
            placeholder="搜索标的名称或代码"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="page-toolbar">
          <Segmented<PlanFilter>
            options={[
              { label: '全部', value: 'all' },
              { label: '执行中', value: 'active' },
              { label: '已归档', value: 'closed' },
              ...(['draft', 'watching', 'holding'].includes(filter)
                ? [{ label: executionStages.find((stage) => stage.status === filter)?.label, value: filter }]
                : []),
            ]}
            value={filter}
            onChange={setFilter}
          />
        </div>

        {loading ? (
          <Skeleton active paragraph={{ rows: 10 }} />
        ) : visiblePlans.length === 0 ? (
          <div className="empty-panel">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={plans.length === 0 ? '还没有交易计划' : query.trim() ? '没有找到匹配的计划' : '当前阶段暂无计划'}
            >
              {plans.length === 0 ? (
                <>
                  <p>写下入场价、失效价和交易逻辑，让每一次执行都有依据。</p>
                  <Button type="primary" onClick={() => setDialogOpen(true)}>
                    创建第一份计划
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => {
                    setFilter('all');
                    setQuery('');
                  }}
                >
                  查看全部计划
                </Button>
              )}
            </Empty>
          </div>
        ) : (
          <div className="plan-card-grid">
            {visiblePlans.map((plan) => {
              const expectedR = calculateExpectedR(plan.entryPrice, plan.stopPrice, plan.targetPrice);
              return (
                <article className="plan-card" key={plan.id}>
                  <div className="plan-card-header">
                    <div>
                      <h2>{plan.name}</h2>
                      <span className="symbol-label">{plan.symbol}</span>
                    </div>
                    <Tag color={planStatusColors[plan.status]}>{planStatusLabels[plan.status]}</Tag>
                  </div>
                  <div className="plans-decision-body">
                    <div className="plans-rationale">
                      <small>交易逻辑</small>
                      <p className="plan-card-thesis">{plan.thesis || '尚未填写交易逻辑'}</p>
                      <span className="plans-updated">{formatDateTime(plan.updatedAt)} 更新</span>
                    </div>
                    <div className="plans-price-block">
                      <div className="plan-levels">
                        <div>
                          <small>入场</small>
                          <strong>{formatPrice(plan.entryPrice)}</strong>
                        </div>
                        <div>
                          <small>失效</small>
                          <strong>{formatPrice(plan.stopPrice)}</strong>
                        </div>
                        <div>
                          <small>目标</small>
                          <strong>{plan.targetPrice === null ? '—' : formatPrice(plan.targetPrice)}</strong>
                        </div>
                      </div>
                      <div className="plan-card-meta">
                        <span>{directionLabels[plan.direction]}</span>
                        <span>
                          风险 <ValueDisplay kind="currency" value={plan.riskAmount} />
                        </span>
                        <span>{expectedR === null ? '未设置目标' : `${expectedR.toFixed(2)}R`}</span>
                      </div>
                    </div>
                  </div>
                  <div className="plan-card-actions">
                    <span className="plans-next-step">
                      {plan.status === 'draft'
                        ? '下一步 · 确认条件并激活监控'
                        : plan.status === 'watching'
                          ? '下一步 · 实际成交后确认入场'
                          : plan.status === 'holding'
                            ? '下一步 · 交易结束后记录复盘'
                            : '计划已归档'}
                    </span>
                    {plan.status === 'draft' ? (
                      <Button type="primary" onClick={() => setActivatingPlan(plan)}>
                        激活计划
                      </Button>
                    ) : null}
                    {plan.status === 'watching' ? (
                      <Button type="primary" onClick={() => void setStatus(plan, 'holding')}>
                        确认已入场
                      </Button>
                    ) : null}
                    {plan.status === 'holding' ? (
                      <Button type="primary" onClick={() => void setStatus(plan, 'completed')}>
                        结束并复盘
                      </Button>
                    ) : null}
                    {['draft', 'watching', 'holding'].includes(plan.status) ? (
                      <Button
                        onClick={() => {
                          modal.confirm(
                            withConfirmDefaults({
                              title: '取消这份计划？',
                              content: '关联的监控提醒将同时停用。',
                              okText: '确认取消',
                              cancelText: '返回',
                              onOk: () => setStatus(plan, 'cancelled'),
                            }),
                          );
                        }}
                      >
                        取消计划
                      </Button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <PlanActivationModal
        open={activatingPlan !== null}
        plan={activatingPlan}
        onClose={() => setActivatingPlan(null)}
        onConfirm={() => {
          if (!activatingPlan) return;
          const plan = activatingPlan;
          setActivatingPlan(null);
          void applyStatus(plan, 'watching');
        }}
      />

      <PlanCreateModal
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={(plan) => {
          setDialogOpen(false);
          void invalidateWorkspaceData().then(() => refetch());
          void message.success(plan.status === 'watching' ? '计划已创建并激活' : '计划已保存为草稿');
        }}
      />
    </main>
  );
}
