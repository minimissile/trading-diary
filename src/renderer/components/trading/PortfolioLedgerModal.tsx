import { useCallback, useEffect, useState } from 'react';
import { App, Button, Checkbox, DatePicker, Form, Input, InputNumber, Modal, Radio } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useNavigate } from 'react-router';
import type { InstrumentInfo, MarketQuote } from '../../../shared/api.types';
import { routePaths } from '../../router/paths';
import type { JournalReviewDraft } from '../../router/journal-state';
import { SymbolSearchInput } from './SymbolSearchInput';
import { AccountSelect } from './AccountSelect';
import { LedgerTradeContextPanel } from './LedgerTradeContextPanel';

interface PortfolioLedgerModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  defaultAccountId?: string;
}

interface FormValues {
  accountId: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  fees: number;
  tradeAt: Dayjs;
  note?: string;
  reviewAfterSave?: boolean;
}

export function PortfolioLedgerModal({
  open,
  onClose,
  onSaved,
  defaultAccountId,
}: PortfolioLedgerModalProps): React.JSX.Element {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [resolved, setResolved] = useState<InstrumentInfo | null>(null);
  const [resolving, setResolving] = useState(false);
  const [quote, setQuote] = useState<MarketQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const side = Form.useWatch('side', form);
  const price = Form.useWatch('price', form);
  const quantity = Form.useWatch('quantity', form);
  const tradeAt = Form.useWatch('tradeAt', form);

  const loadQuote = useCallback(async (symbol: string): Promise<void> => {
    setQuoteLoading(true);
    try {
      const snapshot = await window.desktop.market.getSnapshot(symbol);
      setQuote(snapshot.quote);
    } catch {
      setQuote(null);
    } finally {
      setQuoteLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      form.resetFields();
      setResolved(null);
      setResolving(false);
      setQuote(null);
      setQuoteLoading(false);
      return;
    }
    form.setFieldsValue({
      accountId: defaultAccountId,
      side: 'buy',
      fees: 0,
      tradeAt: dayjs(),
      reviewAfterSave: false,
    });
  }, [defaultAccountId, form, open]);

  useEffect(() => {
    if (!open) return;
    form.setFieldValue('reviewAfterSave', side === 'sell');
  }, [form, open, side]);

  const submit = async (): Promise<void> => {
    const values = await form.validateFields();
    const symbol = values.symbol.trim().toUpperCase();
    setSaving(true);
    try {
      let reviewDraft: JournalReviewDraft | null = null;
      if (values.reviewAfterSave) {
        reviewDraft = await buildReviewDraft(values, symbol, resolved?.name);
      }

      await window.desktop.portfolio.addLedgerEntry({
        accountId: values.accountId,
        symbol,
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

      if (reviewDraft) {
        void navigate(routePaths.journal, {
          state: {
            openReview: true,
            reviewDraft,
          },
        });
      }
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const buildReviewDraft = async (
    values: FormValues,
    symbol: string,
    name?: string,
  ): Promise<JournalReviewDraft> => {
    const displayName = name ?? symbol;
    const tradeLabel = values.side === 'sell' ? '卖出' : '买入';

    if (values.side === 'sell') {
      const positions = await window.desktop.portfolio.listPositions(values.accountId);
      const position = positions.find((item) => item.symbol === symbol);
      return {
        symbol,
        title: `${displayName} · ${tradeLabel}复盘`,
        direction: 'long',
        planned: false,
        entryPrice: position?.avgCost ?? values.price,
        exitPrice: values.price,
        quantity: values.quantity,
        fees: values.fees ?? 0,
        tradeAt: values.tradeAt.toISOString(),
      };
    }

    return {
      symbol,
      title: `${displayName} · ${tradeLabel}复盘`,
      direction: 'long',
      planned: false,
      entryPrice: values.price,
      exitPrice: quote?.price ?? values.price,
      quantity: values.quantity,
      fees: values.fees ?? 0,
      tradeAt: values.tradeAt.toISOString(),
    };
  };

  const estimateFees = async (): Promise<void> => {
    const accountId = form.getFieldValue('accountId') as string | undefined;
    const symbol = form.getFieldValue('symbol') as string | undefined;
    const currentSide = form.getFieldValue('side') as FormValues['side'];
    const currentPrice = form.getFieldValue('price') as number | undefined;
    const currentQuantity = form.getFieldValue('quantity') as number | undefined;

    if (!accountId) {
      void message.warning('请先选择账户');
      return;
    }
    if (!symbol?.trim()) {
      void message.warning('请先输入标的代码');
      return;
    }
    if (!currentPrice || !currentQuantity) {
      void message.warning('请先填写成交价和数量');
      return;
    }

    setEstimating(true);
    try {
      const result = await window.desktop.accounts.estimateFeesForSymbol({
        accountId,
        side: currentSide,
        symbol: symbol.trim().toUpperCase(),
        price: currentPrice,
        quantity: currentQuantity,
      });
      form.setFieldValue('fees', result.totalFees);
      void message.success(
        `已估算：佣金 ${result.commission.toFixed(2)} + 印花税 ${result.stampDuty.toFixed(2)} + 过户费 ${result.transferFee.toFixed(2)}`,
      );
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '费用估算失败');
    } finally {
      setEstimating(false);
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
      width={680}
    >
      <Form<FormValues> form={form} layout="vertical" className="trading-form portfolio-ledger-form">
        <Form.Item label="交易账户" name="accountId" rules={[{ required: true, message: '请选择账户' }]}>
          <AccountSelect />
        </Form.Item>

        <Form.Item
          className="symbol-field"
          label="标的代码"
          name="symbol"
          rules={[{ required: true, message: '请输入标的代码' }]}
          extra={resolved || resolving ? undefined : '输入代码或名称，可选择搜索建议'}
        >
          <SymbolSearchInput
            placeholder="如 600941、510300、161725"
            onResolveStart={() => {
              setResolving(true);
              setQuote(null);
            }}
            onResolve={(instrument) => {
              setResolving(false);
              setResolved(instrument);
              if (instrument) {
                void loadQuote(instrument.symbol);
              } else {
                setQuote(null);
                void message.warning('未识别该代码，保存时将再次尝试解析');
              }
            }}
          />
        </Form.Item>

        {resolved ? (
          <LedgerTradeContextPanel
            instrument={resolved}
            quote={quote}
            quoteLoading={quoteLoading || resolving}
            side={side ?? 'buy'}
            price={price}
            quantity={quantity}
            tradeAt={tradeAt}
          />
        ) : null}

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

        <div className="portfolio-form-row portfolio-form-row--fees">
          <Form.Item label="手续费" name="fees">
            <InputNumber className="full-width-input" min={0} precision={2} />
          </Form.Item>
          <Form.Item label=" ">
            <Button loading={estimating} onClick={() => void estimateFees()}>
              按费率估算
            </Button>
          </Form.Item>
          <Form.Item label="成交时间" name="tradeAt" rules={[{ required: true }]}>
            <DatePicker showTime className="full-width-input" />
          </Form.Item>
        </div>

        <Form.Item name="reviewAfterSave" valuePropName="checked">
          <Checkbox>
            保存后去复盘
            <span className="ledger-review-hint">
              {side === 'sell' ? '（默认带入成本价与卖出价）' : '（带入买入价，退出价参考现价）'}
            </span>
          </Checkbox>
        </Form.Item>

        <Form.Item label="备注" name="note">
          <Input.TextArea rows={2} maxLength={500} placeholder="可选" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
