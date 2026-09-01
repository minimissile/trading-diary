import { useMemo, useState } from 'react';
import { App, Button, Empty, Segmented, Skeleton, Tag } from 'antd';
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

type PlanFilter = 'all' | 'active' | 'closed';

export function PlansPage(): React.JSX.Element {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const { plans, isLoading: loading, refetch } = usePlansQuery();
  const [filter, setFilter] = useState<PlanFilter>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activatingPlan, setActivatingPlan] = useState<TradingPlan | null>(null);

  const visiblePlans = useMemo(() => {
    if (filter === 'all') return plans;
    if (filter === 'active') return plans.filter((plan) => ['draft', 'watching', 'holding'].includes(plan.status));
    return plans.filter((plan) => plan.status === 'completed' || plan.status === 'cancelled');
  }, [filter, plans]);

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
    <main className="workspace-page">
      <header className="page-header">
        <div>
          <p className="page-kicker">PLAYBOOK</p>
          <h1>交易计划</h1>
          <p className="page-intro">先写清入场、失效与风险，再让提醒替你守纪律。</p>
        </div>
        <Button type="primary" size="large" onClick={() => setDialogOpen(true)}>
          新建计划
        </Button>
      </header>

      <div className="page-toolbar">
        <Segmented<PlanFilter>
          options={[
            { label: `全部 ${plans.length}`, value: 'all' },
            { label: '执行中', value: 'active' },
            { label: '已归档', value: 'closed' },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </div>

      {loading ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : visiblePlans.length === 0 ? (
        <div className="empty-panel">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前筛选下还没有计划">
            <Button type="primary" onClick={() => setDialogOpen(true)}>
              创建第一份计划
            </Button>
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
                    <span className="symbol-label">{plan.symbol}</span>
                    <h2>{plan.name}</h2>
                  </div>
                  <Tag color={planStatusColors[plan.status]}>{planStatusLabels[plan.status]}</Tag>
                </div>
                <p className="plan-card-thesis">{plan.thesis}</p>
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
                  <span>风险 <ValueDisplay kind="currency" value={plan.riskAmount} /></span>
                  <span>{expectedR === null ? '未设置目标' : `${expectedR.toFixed(2)}R`}</span>
                  <span>{formatDateTime(plan.updatedAt)} 更新</span>
                </div>
                <div className="plan-card-actions">
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
