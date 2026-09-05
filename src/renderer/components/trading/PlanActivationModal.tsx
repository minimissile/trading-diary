import { Alert, Button, Checkbox, Modal } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { TradingPlan } from '../../../shared/api.types';

interface PlanActivationModalProps {
  open: boolean;
  plan: TradingPlan | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function PlanActivationModal(props: PlanActivationModalProps): React.JSX.Element {
  return props.open ? <PlanActivationModalContent key={props.plan?.id} {...props} /> : <></>;
}

function PlanActivationModalContent({ open, plan, onClose, onConfirm }: PlanActivationModalProps): React.JSX.Element {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const query = useQuery({
    queryKey: ['playbook', 'activation-checklist', plan?.symbol],
    queryFn: () => window.desktop.playbook.activationChecklist(plan!.symbol),
    enabled: open && Boolean(plan),
    retry: false,
  });
  const rules = query.data ?? [];
  const loading = query.isPending || query.isFetching;

  const allChecked = rules.length === 0 || rules.every((rule) => checked[rule.id]);

  return (
    <Modal
      destroyOnHidden
      open={open}
      title={plan ? `激活计划 · ${plan.symbol}` : '激活计划'}
      okText="确认激活"
      cancelText="返回"
      okButtonProps={{ disabled: !allChecked || loading || query.isError }}
      onCancel={onClose}
      onOk={onConfirm}
    >
      <p className="dialog-intro">激活前请确认以下交易规则。这些规则来自你的历史复盘。</p>
      {query.isError ? (
        <Alert
          type="error"
          showIcon
          title="规则清单加载失败"
          description="请重试并核对规则后再激活。"
          action={
            <Button size="small" onClick={() => void query.refetch()}>
              重试
            </Button>
          }
        />
      ) : null}
      {loading ? <p>加载检查清单…</p> : null}
      {!loading && !query.isError && rules.length === 0 ? (
        <p className="playbook-checklist-empty">暂无相关规则，可直接激活。完成复盘后教训会自动写入规则库。</p>
      ) : null}
      {!loading && !query.isError && rules.length > 0 ? (
        <ul className="playbook-checklist">
          {rules.map((rule) => (
            <li key={rule.id}>
              <Checkbox
                checked={checked[rule.id] ?? false}
                onChange={(event) => setChecked((current) => ({ ...current, [rule.id]: event.target.checked }))}
              >
                {rule.content}
              </Checkbox>
            </li>
          ))}
        </ul>
      ) : null}
    </Modal>
  );
}
