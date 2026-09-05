import { useCallback, useEffect, useState } from 'react';
import { App, Button, Form, Input, InputNumber, Modal, Radio } from 'antd';
import type { Dayjs } from 'dayjs';
import { useNavigate } from 'react-router';
import type { InstrumentInfo, MarketQuote, TradeEpisodeView } from '../../../shared/api.types';
import { routePaths } from '../../router/paths';
import { AccountSelect } from './AccountSelect';
import { LedgerTradeContextPanel } from './LedgerTradeContextPanel';
import { SymbolSearchInput } from './SymbolSearchInput';
import { TradeDatePicker } from './TradeDatePicker';
import { defaultTradeAt, tradeAtToIso } from '../../lib/trade-date';

interface ExecutionEntryModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (episode: TradeEpisodeView) => void;
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
}

/**
 * 录入买卖成交，自动归入交易回合。
 */
export function ExecutionEntryModal(props: ExecutionEntryModalProps): React.JSX.Element {
  return props.open ? <ExecutionEntryModalContent key={props.defaultAccountId} {...props} /> : <></>;
}

function ExecutionEntryModalContent({ open, onClose, onSaved, defaultAccountId }: ExecutionEntryModalProps): React.JSX.Element {
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

  const loadQuote = useCallback(
    async (symbol: string): Promise<void> => {
      setQuoteLoading(true);
      try {
        const snapshot = await window.desktop.market.getSnapshot(symbol);
        setQuote(snapshot.quote);
        if (snapshot.quote.price !== null) {
          form.setFieldValue('price', snapshot.quote.price);
        }
      } catch {
        setQuote(null);
      } finally {
        setQuoteLoading(false);
      }
    },
    [form],
  );

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      accountId: defaultAccountId,
      side: 'buy',
      fees: 0,
      tradeAt: defaultTradeAt(),
    });
  }, [defaultAccountId, form, open]);

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
      void message.success(`已估算费用 ${result.totalFees.toFixed(2)} 元`);
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '费用估算失败');
    } finally {
      setEstimating(false);
    }
  };

  const submit = async (): Promise<void> => {
    const values = await form.validateFields();
    const symbol = values.symbol.trim().toUpperCase();
    setSaving(true);
    try {
      const episode = await window.desktop.episodes.addExecution({
        accountId: values.accountId,
        symbol,
        side: values.side,
        quantity: values.quantity,
        price: values.price,
        fees: values.fees ?? 0,
        tradeAt: tradeAtToIso(values.tradeAt),
        note: values.note?.trim(),
        source: 'manual',
      });

      void message.success(values.side === 'buy' ? '买入成交已记录' : '卖出成交已记录');
      onSaved(episode);
      onClose();

      if (episode.status === 'closed' && episode.reviewId === null) {
        void navigate(routePaths.journal, {
          state: {
            episodeId: episode.id,
            openReview: true,
          },
        });
      }
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '成交保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="记录成交"
      open={open}
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      onCancel={onClose}
      onOk={() => void submit()}
      destroyOnHidden
      width={680}
    >
      <p className="dialog-intro">每笔买卖自动归入同一标的的交易回合；全部卖出后进入待复盘。</p>
      <Form<FormValues> form={form} layout="vertical" preserve={false}>
        <Form.Item label="账户" name="accountId" rules={[{ required: true, message: '请选择账户' }]}>
          <AccountSelect />
        </Form.Item>

        <Form.Item label="标的" name="symbol" rules={[{ required: true, message: '请输入标的代码' }]}>
          <SymbolSearchInput
            placeholder="如 600519、510300"
            onResolveStart={() => {
              setResolving(true);
              setQuote(null);
            }}
            onResolve={(instrument) => {
              setResolving(false);
              setResolved(instrument);
              if (instrument) void loadQuote(instrument.symbol);
              else setQuote(null);
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
            optionType="button"
            options={[
              { label: '买入', value: 'buy' },
              { label: '卖出', value: 'sell' },
            ]}
          />
        </Form.Item>

        <div className="form-grid form-grid--3">
          <Form.Item label="成交价" name="price" rules={[{ required: true, message: '请输入成交价' }]}>
            <InputNumber min={0.0001} precision={4} />
          </Form.Item>
          <Form.Item label="数量" name="quantity" rules={[{ required: true, message: '请输入数量' }]}>
            <InputNumber min={0.0001} precision={4} />
          </Form.Item>
          <Form.Item label="费用" name="fees" rules={[{ required: true }]}>
            <InputNumber
              min={0}
              precision={2}
              prefix="¥"
              addonAfter={
                <Button type="link" size="small" loading={estimating} onClick={() => void estimateFees()}>
                  估算
                </Button>
              }
            />
          </Form.Item>
        </div>

        <Form.Item label="成交时间" name="tradeAt" rules={[{ required: true, message: '请选择成交时间' }]}>
          <TradeDatePicker style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item label="备注" name="note">
          <Input.TextArea rows={2} maxLength={500} placeholder="可选，如「突破入场」「止损离场」" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
