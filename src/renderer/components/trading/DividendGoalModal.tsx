import { useEffect, useState } from 'react';
import { App, Button, Form, InputNumber, Modal } from 'antd';
import { hasDividendGoal, type DividendGoalSettings } from '../../../shared/portfolio/dividend-goal';

interface DividendGoalModalProps {
  open: boolean;
  accountId: string;
  settings: DividendGoalSettings | null;
  onClose: () => void;
  onSaved: (settings: DividendGoalSettings | null) => void;
}

interface FormValues {
  ytdTarget?: number | null;
  dailyTarget?: number | null;
}

/**
 * 设置分红目标的弹窗，支持同时配置累计与日均目标。
 */
export function DividendGoalModal({
  open,
  accountId,
  settings,
  onClose,
  onSaved,
}: DividendGoalModalProps): React.JSX.Element {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      ytdTarget: settings?.ytdTarget ?? undefined,
      dailyTarget: settings?.dailyTarget ?? undefined,
    });
  }, [form, open, settings]);

  const save = async (): Promise<void> => {
    const values = await form.validateFields();
    const payload: DividendGoalSettings = {
      ytdTarget: values.ytdTarget && values.ytdTarget > 0 ? values.ytdTarget : null,
      dailyTarget: values.dailyTarget && values.dailyTarget > 0 ? values.dailyTarget : null,
    };

    if (!hasDividendGoal(payload)) {
      void message.warning('请至少填写一个目标金额');
      return;
    }

    setSaving(true);
    try {
      const next = await window.desktop.portfolio.saveDividendGoal(accountId, payload);
      onSaved(next);
      void message.success('分红目标已保存');
      onClose();
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const clear = async (): Promise<void> => {
    setSaving(true);
    try {
      await window.desktop.portfolio.saveDividendGoal(accountId, null);
      onSaved(null);
      void message.success('分红目标已清除');
      onClose();
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '清除失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="设置分红目标"
      open={open}
      onCancel={onClose}
      destroyOnHidden
      footer={[
        hasDividendGoal(settings) ? (
          <Button key="clear" danger loading={saving} onClick={() => void clear()}>
            清除全部
          </Button>
        ) : null,
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button key="save" type="primary" loading={saving} onClick={() => void save()}>
          保存
        </Button>,
      ]}
    >
      <Form<FormValues> form={form} layout="vertical">
        <Form.Item
          name="ytdTarget"
          label="今年累计分红目标"
          rules={[{ type: 'number', min: 0.01, message: '目标金额必须大于 0' }]}
        >
          <InputNumber className="full-width-input" min={0.01} precision={2} addonBefore="¥" placeholder="可选" />
        </Form.Item>
        <Form.Item
          name="dailyTarget"
          label="日均分红目标"
          rules={[{ type: 'number', min: 0.01, message: '目标金额必须大于 0' }]}
        >
          <InputNumber className="full-width-input" min={0.01} precision={2} addonBefore="¥" placeholder="可选" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
