import { Empty, Tag } from 'antd';
import type { TradingPlan } from '../../../shared/api.types';
import {
  calculateExpectedR,
  directionLabels,
  formatCurrency,
  formatDateTime,
  formatPrice,
  planStatusColors,
  planStatusLabels,
} from '../../lib/trading-format';

interface PlanDetailPanelProps {
  plan: TradingPlan | null;
}

export function PlanDetailPanel({ plan }: PlanDetailPanelProps): React.JSX.Element {
  if (!plan) {
    return (
      <aside className="plan-summary-panel">
        <div className="panel-heading">计划摘要</div>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择一份计划查看摘要" />
      </aside>
    );
  }

  const expectedR = calculateExpectedR(plan.entryPrice, plan.stopPrice, plan.targetPrice);
  return (
    <aside className="plan-summary-panel">
      <div className="panel-heading">计划摘要</div>
      <div className="plan-summary-title">
        <div>
          <strong>{plan.name}</strong>
          <span>{plan.symbol}</span>
        </div>
        <Tag color={planStatusColors[plan.status]}>{planStatusLabels[plan.status]}</Tag>
      </div>
      <p className="plan-summary-thesis">{plan.thesis}</p>
      <dl className="plan-summary-list">
        <div>
          <dt>交易方向</dt>
          <dd>{directionLabels[plan.direction]}</dd>
        </div>
        <div>
          <dt>计划入场价</dt>
          <dd>{formatPrice(plan.entryPrice)}</dd>
        </div>
        <div>
          <dt>风险失效价</dt>
          <dd>{formatPrice(plan.stopPrice)}</dd>
        </div>
        <div>
          <dt>计划目标价</dt>
          <dd>{plan.targetPrice === null ? '未设置' : formatPrice(plan.targetPrice)}</dd>
        </div>
        <div>
          <dt>最大计划风险</dt>
          <dd>{formatCurrency(plan.riskAmount)}</dd>
        </div>
        <div>
          <dt>预期 R 倍数</dt>
          <dd>{expectedR === null ? '—' : `${expectedR.toFixed(2)}R`}</dd>
        </div>
      </dl>
      <div className="plan-summary-meta">
        <span>本地计划</span>
        <span>更新于 {formatDateTime(plan.updatedAt)}</span>
      </div>
    </aside>
  );
}
