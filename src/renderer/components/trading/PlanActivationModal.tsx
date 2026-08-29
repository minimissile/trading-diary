import { Checkbox, Modal } from 'antd';
import { useEffect, useState } from 'react';
import type { PlaybookRule } from '../../../shared/playbook/types';
import type { TradingPlan } from '../../../shared/api.types';

interface PlanActivationModalProps {
  open: boolean;
  plan: TradingPlan | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function PlanActivationModal({ open, plan, onClose, onConfirm }: PlanActivationModalProps): React.JSX.Element {
  const [rules, setRules] = useState<PlaybookRule[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !plan) return;
    let active = true;
    setLoading(true);
    void window.desktop.playbook
      .activationChecklist(plan.symbol)
      .then((checklist) => {
        if (!active) return;
        setRules(checklist);
        setChecked(Object.fromEntries(checklist.map((rule) => [rule.id, false])));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, plan]);

  const allChecked = rules.length === 0 || rules.every((rule) => checked[rule.id]);

  return (
    <Modal
      destroyOnHidden
      open={open}
      title={plan ? `激活计划 · ${plan.symbol}` : '激活计划'}
      okText="确认激活"
      cancelText="返回"
      okButtonProps={{ disabled: !allChecked || loading }}
      onCancel={onClose}
      onOk={onConfirm}
    >
      <p className="dialog-intro">激活前请确认以下交易规则。这些规则来自你的历史复盘。</p>
      {loading ? <p>加载检查清单…</p> : null}
      {!loading && rules.length === 0 ? (
        <p className="playbook-checklist-empty">暂无相关规则，可直接激活。完成复盘后教训会自动写入规则库。</p>
      ) : null}
      {!loading && rules.length > 0 ? (
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
