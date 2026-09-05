import { useEffect, useState } from 'react';
import { App, Form, Input, InputNumber, Modal } from 'antd';
import type { CreateTradeReviewInput } from '../../../shared/api.types';
import type { SipReviewTemplate } from '../../../shared/sip/types';

interface SipReviewModalProps {
  open: boolean;
  planId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FormValues {
  summary: string;
  lesson: string;
  executionScore: number;
}

export function SipReviewModal(props: SipReviewModalProps): React.JSX.Element {
  return props.open ? <SipReviewModalContent key={props.planId ?? undefined} {...props} /> : <></>;
}

function SipReviewModalContent({ open, planId, onClose, onSaved }: SipReviewModalProps): React.JSX.Element {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [template, setTemplate] = useState<SipReviewTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !planId) return;
    let active = true;
    void window.desktop.sip
      .getReviewTemplate(planId)
      .then((next) => {
        if (!active) return;
        setTemplate(next);
        form.setFieldsValue({
          summary: next.summary,
          lesson: next.lesson,
          executionScore: 4,
        });
      })
      .catch((reason: unknown) => {
        void message.error(reason instanceof Error ? reason.message : '复盘模板加载失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [form, message, open, planId]);

  const save = async (): Promise<void> => {
    if (!template) return;
    const values = await form.validateFields();
    setSaving(true);
    try {
      const input: CreateTradeReviewInput = {
        planId: null,
        symbol: template.symbol,
        title: template.title,
        direction: 'long',
        planned: true,
        entryPrice: template.entryPrice,
        exitPrice: template.entryPrice,
        quantity: template.quantity,
        fees: template.fees,
        executionScore: values.executionScore,
        summary: values.summary.trim(),
        lesson: values.lesson.trim(),
      };
      await window.desktop.reviews.create(input);
      void message.success('定投复盘已保存');
      onSaved();
      onClose();
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={template?.title ?? '定投周期复盘'}
      open={open}
      onCancel={onClose}
      onOk={() => void save()}
      okText="保存复盘"
      confirmLoading={saving}
      width={720}
      destroyOnHidden
    >
      {loading ? <p>正在生成复盘模板…</p> : null}
      {!loading && template ? (
        <Form form={form} layout="vertical">
          <Form.Item label="执行评分" name="executionScore" rules={[{ required: true }]}>
            <InputNumber min={1} max={5} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item label="本期检视" name="summary" rules={[{ required: true, message: '请填写检视内容' }]}>
            <Input.TextArea rows={10} />
          </Form.Item>
          <Form.Item label="经验沉淀" name="lesson" rules={[{ required: true, message: '请填写经验总结' }]}>
            <Input.TextArea rows={6} />
          </Form.Item>
        </Form>
      ) : null}
    </Modal>
  );
}
