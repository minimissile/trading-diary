import { useEffect, useState } from 'react';
import { App, Form, InputNumber, Modal } from 'antd';
import type { FundSipOccurrenceView } from '../../../shared/sip/types';
import { formatPrice, ValueDisplay } from '../../lib/trading-format';

interface SipConfirmModalProps {
  open: boolean;
  occurrence: FundSipOccurrenceView | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FormValues {
  nav: number;
  quantity: number;
  fees: number;
}

export function SipConfirmModal({ open, occurrence, onClose, onSaved }: SipConfirmModalProps): React.JSX.Element {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);
  const nav = Form.useWatch('nav', form);
  const fees = Form.useWatch('fees', form) ?? 0;

  useEffect(() => {
    if (!open || !occurrence) return;
    const loadQuote = async (): Promise<void> => {
      try {
        const quote = await window.desktop.market.getQuote(occurrence.symbol);
        const referenceNav = quote.nav ?? quote.price;
        form.setFieldsValue({
          nav: referenceNav ?? undefined,
          fees: 0,
          quantity:
            referenceNav && occurrence.plannedAmount
              ? Math.round(((occurrence.plannedAmount - 0) / referenceNav) * 100) / 100
              : undefined,
        });
      } catch {
        form.setFieldsValue({ fees: 0 });
      }
    };
    void loadQuote();
  }, [form, occurrence, open]);

  useEffect(() => {
    if (!open || !occurrence || !nav || nav <= 0) return;
    const quantity = Math.round(((occurrence.plannedAmount - fees) / nav) * 100) / 100;
    form.setFieldValue('quantity', quantity);
  }, [fees, form, nav, occurrence, open]);

  const confirm = async (): Promise<void> => {
    if (!occurrence) return;
    const values = await form.validateFields();
    setSaving(true);
    try {
      await window.desktop.sip.confirmOccurrence({
        id: occurrence.id,
        nav: values.nav,
        quantity: values.quantity,
        fees: values.fees,
      });
      void message.success('扣款已确认并写入持仓');
      onSaved();
      onClose();
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '确认失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={occurrence ? `确认扣款 · ${occurrence.planName}` : '确认扣款'}
      open={open}
      onCancel={onClose}
      onOk={() => void confirm()}
      confirmLoading={saving}
      okText="确认已扣款"
      destroyOnHidden
    >
      {occurrence ? (
        <>
          <p className="sip-confirm-meta">
            {occurrence.symbol} · 计划扣款日 {occurrence.scheduledDate} · 计划金额{' '}
            <ValueDisplay kind="currency" value={occurrence.plannedAmount} />
          </p>
          <Form<FormValues> form={form} layout="vertical" preserve={false}>
            <Form.Item label="确认净值" name="nav" rules={[{ required: true, message: '请输入确认净值' }]}>
              <InputNumber min={0.0001} precision={4} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="手续费" name="fees" initialValue={0}>
              <InputNumber min={0} precision={2} style={{ width: '100%' }} addonAfter="元" />
            </Form.Item>
            <Form.Item label="确认份额" name="quantity" rules={[{ required: true, message: '请输入确认份额' }]}>
              <InputNumber min={0.01} precision={2} style={{ width: '100%' }} />
            </Form.Item>
            {nav ? (
              <p className="sip-confirm-hint">
                估算投入 <ValueDisplay kind="currency" value={occurrence.plannedAmount} />，净值 {formatPrice(nav)}
              </p>
            ) : null}
          </Form>
        </>
      ) : null}
    </Modal>
  );
}
