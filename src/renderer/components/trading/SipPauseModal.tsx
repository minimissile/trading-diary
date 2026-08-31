import { App, DatePicker, Form, Modal } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo } from 'react';
import type { FundSipPlanView } from '../../../shared/sip/types';
import { formatSipSchedule, sipFrequencyLabels } from '../../lib/trading-format';

interface SipPauseModalProps {
  open: boolean;
  plan: FundSipPlanView | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FormValues {
  fromDate: Dayjs;
}

function defaultPauseDate(plan: FundSipPlanView): Dayjs {
  if (plan.lastCompletedDate) {
    return dayjs(plan.lastCompletedDate).add(1, 'day');
  }
  if (plan.pauseFromDate) {
    return dayjs(plan.pauseFromDate);
  }
  return dayjs();
}

export function SipPauseModal({ open, plan, onClose, onSaved }: SipPauseModalProps): React.JSX.Element {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();

  useEffect(() => {
    if (!open || !plan) return;
    form.setFieldsValue({ fromDate: defaultPauseDate(plan) });
  }, [form, open, plan]);

  const suggestedDates = useMemo(() => {
    if (!plan) return [];
    const dates: string[] = [];
    if (plan.lastCompletedDate) {
      dates.push(dayjs(plan.lastCompletedDate).add(1, 'day').format('YYYY-MM-DD'));
    }
    if (plan.pauseFromDate) dates.push(plan.pauseFromDate);
    return [...new Set(dates)].sort();
  }, [plan]);

  const submit = async (): Promise<void> => {
    if (!plan) return;
    const values = await form.validateFields();
    const fromDate = values.fromDate.format('YYYY-MM-DD');
    try {
      const result = await window.desktop.sip.schedulePause(plan.id, fromDate);
      onSaved();
      onClose();
      const cleanup =
        result.removedOccurrences > 0 || result.removedLedgerEntries > 0
          ? `，已清除 ${result.removedOccurrences} 条期次${
              result.removedLedgerEntries > 0 ? `、${result.removedLedgerEntries} 条流水` : ''
            }`
          : '';
      void message.success(`已自 ${fromDate} 起暂停${cleanup}`);
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '暂停设置失败');
    }
  };

  const minDate = plan ? dayjs(plan.startDate) : dayjs().subtract(10, 'year');

  return (
    <Modal
      title={plan?.status === 'paused' ? '调整暂停日' : '暂停定投'}
      open={open}
      onCancel={onClose}
      onOk={() => void submit()}
      okText="确认"
      destroyOnHidden
      width={520}
    >
      {plan ? (
        <>
          <p className="dialog-intro">
            <strong>{plan.name}</strong> · {plan.symbol} · {sipFrequencyLabels[plan.frequency]} ·{' '}
            {formatSipSchedule(plan)}
          </p>
          <p className="sip-pause-hint">
            选择从哪一天起停止定投。该日及之后的期次与关联流水将被清除；该日之前的已确认扣款会保留。
            {plan.lastCompletedDate ? ` 最近一笔扣款日为 ${plan.lastCompletedDate}。` : ''}
          </p>
          <Form<FormValues> form={form} layout="vertical">
            <Form.Item
              label="暂停起始日"
              name="fromDate"
              rules={[{ required: true, message: '请选择暂停起始日' }]}
            >
              <DatePicker
                style={{ width: '100%' }}
                disabledDate={(current) => current.isBefore(minDate.startOf('day'))}
              />
            </Form.Item>
          </Form>
          {suggestedDates.length > 0 ? (
            <p className="sip-pause-next">
              建议日期：
              {suggestedDates.map((date) => (
                <button
                  key={date}
                  type="button"
                  className="link-button"
                  onClick={() => form.setFieldsValue({ fromDate: dayjs(date) })}
                >
                  {date}
                </button>
              ))}
            </p>
          ) : null}
        </>
      ) : null}
    </Modal>
  );
}
