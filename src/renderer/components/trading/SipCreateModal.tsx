import { useEffect, useState } from 'react';
import { App, Checkbox, DatePicker, Form, Input, InputNumber, Modal, Radio, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { CreateFundSipPlanInput, FundSipOccurrencePreview, SipFrequency } from '../../../shared/sip/types';
import { AccountSelect } from './AccountSelect';
import { SymbolSearchInput } from './SymbolSearchInput';
import { weekdayLabels } from '../../lib/trading-format';

interface SipCreateModalProps {
  open: boolean;
  defaultAccountId?: string;
  onClose: () => void;
  onSaved: () => void;
}

interface FormValues {
  accountId: string;
  symbol: string;
  amount: number;
  frequency: SipFrequency;
  dayOfWeek: number;
  dayOfMonth: number;
  startDate: Dayjs;
  thesis: string;
  activateNow: boolean;
}

export function SipCreateModal({
  open,
  defaultAccountId,
  onClose,
  onSaved,
}: SipCreateModalProps): React.JSX.Element {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<FundSipOccurrencePreview[]>([]);
  const frequency = Form.useWatch('frequency', form) ?? 'monthly';

  useEffect(() => {
    if (!open) {
      form.resetFields();
      setPreview([]);
      return;
    }
    form.setFieldsValue({
      accountId: defaultAccountId,
      frequency: 'monthly',
      dayOfWeek: 1,
      dayOfMonth: 1,
      amount: 500,
      startDate: dayjs(),
      activateNow: true,
    });
  }, [defaultAccountId, form, open]);

  const buildInput = (values: FormValues): CreateFundSipPlanInput => ({
    accountId: values.accountId,
    symbol: values.symbol.trim().toUpperCase(),
    amount: values.amount,
    frequency: values.frequency,
    dayOfWeek: values.frequency === 'monthly' ? undefined : values.dayOfWeek,
    dayOfMonth: values.frequency === 'monthly' ? values.dayOfMonth : undefined,
    startDate: values.startDate.format('YYYY-MM-DD'),
    thesis: values.thesis.trim(),
    activateNow: values.activateNow,
  });

  const refreshPreview = async (): Promise<void> => {
    try {
      const values = await form.validateFields(['symbol', 'amount', 'frequency', 'dayOfWeek', 'dayOfMonth', 'startDate', 'thesis']);
      setPreview(await window.desktop.sip.previewSchedule(buildInput(values as FormValues)));
    } catch {
      setPreview([]);
    }
  };

  const save = async (): Promise<void> => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await window.desktop.sip.create(buildInput(values));
      void message.success('定投计划已创建');
      onSaved();
      onClose();
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '创建失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="新建基金定投"
      open={open}
      onCancel={onClose}
      onOk={() => void save()}
      confirmLoading={saving}
      okText="创建计划"
      width={640}
      destroyOnHidden
    >
      <Form<FormValues> form={form} layout="vertical" preserve={false} onValuesChange={() => void refreshPreview()}>
        <Form.Item label="扣款账户" name="accountId" rules={[{ required: true, message: '请选择账户' }]}>
          <AccountSelect />
        </Form.Item>
        <Form.Item label="基金代码" name="symbol" rules={[{ required: true, message: '请输入基金代码' }]}>
          <SymbolSearchInput placeholder="输入场外基金 / ETF / LOF 代码" />
        </Form.Item>
        <Form.Item label="每期金额（元）" name="amount" rules={[{ required: true, message: '请输入每期金额' }]}>
          <InputNumber min={1} precision={2} style={{ width: '100%' }} addonAfter="元" />
        </Form.Item>
        <Form.Item label="扣款频率" name="frequency" rules={[{ required: true }]}>
          <Radio.Group>
            <Radio.Button value="weekly">每周</Radio.Button>
            <Radio.Button value="biweekly">每两周</Radio.Button>
            <Radio.Button value="monthly">每月</Radio.Button>
          </Radio.Group>
        </Form.Item>
        {frequency === 'monthly' ? (
          <Form.Item label="扣款日" name="dayOfMonth" rules={[{ required: true, message: '请选择扣款日' }]}>
            <InputNumber min={1} max={28} precision={0} style={{ width: '100%' }} addonAfter="日（1–28）" />
          </Form.Item>
        ) : (
          <Form.Item label="扣款 weekday" name="dayOfWeek" rules={[{ required: true, message: '请选择 weekday' }]}>
            <Select
              options={Object.entries(weekdayLabels).map(([value, label]) => ({
                value: Number(value),
                label,
              }))}
            />
          </Form.Item>
        )}
        <Form.Item label="开始日期" name="startDate" rules={[{ required: true, message: '请选择开始日期' }]}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="定投逻辑" name="thesis" rules={[{ required: true, message: '请填写定投逻辑' }]}>
          <Input.TextArea rows={3} placeholder="例如：长期配置宽基指数，忽略短期波动" maxLength={2000} showCount />
        </Form.Item>
        <Form.Item name="activateNow" valuePropName="checked" initialValue={true}>
          <Checkbox>创建后立即启用</Checkbox>
        </Form.Item>
        {preview.length > 0 ? (
          <div className="sip-preview-dates">
            <strong>近期扣款日预览</strong>
            <ul>
              {preview.map((item) => (
                <li key={item.scheduledDate}>{item.scheduledDate}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </Form>
    </Modal>
  );
}
