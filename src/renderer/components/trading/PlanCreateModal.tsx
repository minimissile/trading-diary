import { useState } from 'react';
import { Alert, Button, Form, Input, InputNumber, Modal, Radio, Space, Switch } from 'antd';
import type { TradeDirection, TradingPlan } from '../../../shared/api.types';
import { calculateExpectedR } from '../../lib/trading-format';
import { SymbolSearchInput } from './SymbolSearchInput';

interface PlanFormValues {
  symbol: string;
  name: string;
  direction: TradeDirection;
  thesis: string;
  entryPrice: number;
  stopPrice: number;
  targetPrice?: number;
  riskAmount: number;
  activateNow: boolean;
}

interface PlanCreateModalProps {
  open: boolean;
  initialValues?: Partial<PlanFormValues>;
  onClose: () => void;
  onSaved: (plan: TradingPlan) => void;
}

export function PlanCreateModal({ open, onClose, onSaved, initialValues }: PlanCreateModalProps): React.JSX.Element {
  const [form] = Form.useForm<PlanFormValues>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entryPrice = Form.useWatch('entryPrice', form);
  const stopPrice = Form.useWatch('stopPrice', form);
  const targetPrice = Form.useWatch('targetPrice', form);
  const expectedR =
    typeof entryPrice === 'number' && typeof stopPrice === 'number'
      ? calculateExpectedR(entryPrice, stopPrice, typeof targetPrice === 'number' ? targetPrice : null)
      : null;

  const save = async (): Promise<void> => {
    const values = await form.validateFields();
    setSaving(true);
    setError(null);
    try {
      const plan = await window.desktop.plans.create({
        ...values,
        symbol: values.symbol.trim().toUpperCase(),
        targetPrice: values.targetPrice ?? null,
      });
      form.resetFields();
      onSaved(plan);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '计划保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={saving} onClick={() => void save()}>
            保存计划
          </Button>
        </Space>
      }
      open={open}
      scrollLock={false}
      title="新建交易计划"
      width={680}
      onCancel={onClose}
    >
      <p className="dialog-intro">先定义行动条件和风险边界，激活后系统才开始监控入场提醒。</p>
      {error ? <Alert className="dialog-alert" type="error" title={error} showIcon /> : null}
      <Form
        form={form}
        initialValues={{ activateNow: true, direction: 'long', riskAmount: 1000, ...initialValues }}
        layout="vertical"
        preserve={false}
      >
        <div className="form-grid form-grid--2">
          <Form.Item label="标的代码" name="symbol" rules={[{ required: true, message: '请输入标的代码' }]}>
            <SymbolSearchInput placeholder="例如 600519 / 510300" maxLength={32} />
          </Form.Item>
          <Form.Item label="计划名称" name="name" rules={[{ required: true, message: '请输入计划名称' }]}>
            <Input placeholder="例如 回踩支撑入场" maxLength={80} />
          </Form.Item>
        </div>

        <Form.Item label="方向" name="direction">
          <Radio.Group
            options={[
              { label: '做多', value: 'long' },
              { label: '做空', value: 'short' },
            ]}
            optionType="button"
          />
        </Form.Item>

        <Form.Item label="一句话交易逻辑" name="thesis" rules={[{ required: true, message: '请写清楚交易逻辑' }]}>
          <Input.TextArea rows={3} placeholder="什么条件成立时行动，什么变化意味着逻辑失效？" maxLength={1000} showCount />
        </Form.Item>

        <div className="form-grid form-grid--4">
          <Form.Item label="计划入场价" name="entryPrice" rules={[{ required: true, message: '请输入入场价' }]}>
            <InputNumber min={0.0001} precision={4} placeholder="0.0000" />
          </Form.Item>
          <Form.Item label="风险失效价" name="stopPrice" rules={[{ required: true, message: '请输入失效价' }]}>
            <InputNumber min={0.0001} precision={4} placeholder="0.0000" />
          </Form.Item>
          <Form.Item label="计划目标价" name="targetPrice">
            <InputNumber min={0.0001} precision={4} placeholder="可选" />
          </Form.Item>
          <Form.Item label="最大风险金额" name="riskAmount" rules={[{ required: true, message: '请输入风险金额' }]}>
            <InputNumber min={0} precision={2} prefix="¥" />
          </Form.Item>
        </div>

        <div className="plan-form-footer">
          <div>
            <span>预期盈亏比</span>
            <strong>{expectedR === null ? '—' : `${expectedR.toFixed(2)}R`}</strong>
          </div>
          <Form.Item label="保存后立即监控入场" name="activateNow" valuePropName="checked">
            <Switch />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
