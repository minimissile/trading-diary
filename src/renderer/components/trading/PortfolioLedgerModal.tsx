import { useEffect, useState } from 'react';
import { App, DatePicker, Form, Input, InputNumber, Modal, Radio } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { CreatePortfolioLedgerInput, InstrumentInfo } from '../../../shared/api.types';
import { SymbolSearchInput } from './SymbolSearchInput';

interface PortfolioLedgerModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

interface FormValues {
  symbol: string;
  side: CreatePortfolioLedgerInput['side'];
  quantity: number;
  price: number;
  fees: number;
  tradeAt: Dayjs;
  note?: string;
}

const kindLabels: Record<string, string> = {
  stock: 'A股',
  etf: 'ETF',
  lof: 'LOF',
  otc_fund: '场外基金',
};

export function PortfolioLedgerModal({ open, onClose, onSaved }: PortfolioLedgerModalProps): React.JSX.Element {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);
  const [resolved, setResolved] = useState<InstrumentInfo | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!open) {
      form.resetFields();
      setResolved(null);
      setResolving(false);
      return;
    }
    form.setFieldsValue({
      side: 'buy',
      fees: 0,
      tradeAt: dayjs(),
    });
  }, [form, open]);

  const submit = async (): Promise<void> => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await window.desktop.portfolio.addLedgerEntry({
        symbol: values.symbol.trim().toUpperCase(),
        kind: resolved?.kind,
        side: values.side,
        quantity: values.quantity,
        price: values.price,
        fees: values.fees ?? 0,
        tradeAt: values.tradeAt.toISOString(),
        note: values.note?.trim(),
        source: 'manual',
      });
      void message.success(values.side === 'buy' ? '买入记录已保存' : '卖出记录已保存');
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
      title="录入持仓流水"
      open={open}
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      onCancel={onClose}
      onOk={() => void submit()}
      destroyOnHidden
    >
      <Form<FormValues> form={form} layout="vertical" className="portfolio-ledger-form">
        <Form.Item
          label="标的代码"
          name="symbol"
          rules={[{ required: true, message: '请输入标的代码' }]}
          extra={
            resolved ? (
              <span>
                {resolved.name} · {kindLabels[resolved.kind] ?? resolved.kind}
              </span>
            ) : resolving ? (
              '识别中…'
            ) : (
              '输入代码或名称，可选择搜索建议'
            )
          }
        >
          <SymbolSearchInput
            placeholder="如 600941、510300、161725"
            onResolveStart={() => setResolving(true)}
            onResolve={(instrument) => {
              setResolving(false);
              setResolved(instrument);
              if (!instrument) void message.warning('未识别该代码，保存时将再次尝试解析');
            }}
          />
        </Form.Item>

        <Form.Item label="方向" name="side" rules={[{ required: true }]}>
          <Radio.Group
            options={[
              { label: '买入', value: 'buy' },
              { label: '卖出', value: 'sell' },
            ]}
          />
        </Form.Item>

        <div className="portfolio-form-row">
          <Form.Item label="数量" name="quantity" rules={[{ required: true, message: '请输入数量' }]}>
            <InputNumber className="full-width-input" min={0.0001} precision={4} />
          </Form.Item>
          <Form.Item label="成交价" name="price" rules={[{ required: true, message: '请输入价格' }]}>
            <InputNumber className="full-width-input" min={0.0001} precision={4} />
          </Form.Item>
        </div>

        <div className="portfolio-form-row">
          <Form.Item label="手续费" name="fees">
            <InputNumber className="full-width-input" min={0} precision={2} />
          </Form.Item>
          <Form.Item label="成交时间" name="tradeAt" rules={[{ required: true }]}>
            <DatePicker showTime className="full-width-input" />
          </Form.Item>
        </div>

        <Form.Item label="备注" name="note">
          <Input.TextArea rows={2} maxLength={500} placeholder="可选" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
