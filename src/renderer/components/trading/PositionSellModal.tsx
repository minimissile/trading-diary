import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Checkbox, Form, Input, InputNumber, Modal, Segmented } from 'antd';
import type { Dayjs } from 'dayjs';
import { useNavigate } from 'react-router';
import type { PortfolioPositionView } from '../../../shared/portfolio/types';
import { ALL_ACCOUNTS_ID, isAllAccountsId } from '../../../shared/accounts/constants';
import {
  quantityFromFraction,
  roundSellQuantity,
  SELL_FRACTION_PRESETS,
} from '../../../shared/portfolio/sell-quantity';
import { routePaths } from '../../router/paths';
import type { JournalReviewDraft } from '../../router/journal-state';
import { AccountSelect } from './AccountSelect';
import { TradeDatePicker } from './TradeDatePicker';
import { formatPriceForKind, formatQuantityForKind } from '../../lib/trading-format';
import { defaultTradeAt, tradeAtToIso } from '../../lib/trade-date';

interface PositionSellModalProps {
  open: boolean;
  position: PortfolioPositionView | null;
  accountId?: string;
  onClose: () => void;
  onSaved: () => void;
}

interface FormValues {
  accountId: string;
  quantity: number;
  price: number;
  fees: number;
  tradeAt: Dayjs;
  note?: string;
  reviewAfterSave?: boolean;
}

export function PositionSellModal({
  open,
  position,
  accountId,
  onClose,
  onSaved,
}: PositionSellModalProps): React.JSX.Element {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [activeFraction, setActiveFraction] = useState<number | null>(null);
  const [resolvedAccountId, setResolvedAccountId] = useState<string | null>(null);
  const [availableQuantity, setAvailableQuantity] = useState<number | null>(null);

  const kind = position?.kind ?? 'stock';
  const maxQuantity = availableQuantity ?? position?.quantity ?? 0;

  const resolveAccount = useCallback(async (): Promise<void> => {
    if (!position) return;
    if (accountId && !isAllAccountsId(accountId)) {
      setResolvedAccountId(accountId);
      setAvailableQuantity(position.quantity);
      return;
    }

    const entries = await window.desktop.portfolio.listLedgerEntries(ALL_ACCOUNTS_ID, position.symbol);
    const accountIds = [...new Set(entries.map((item) => item.accountId))];
    if (accountIds.length === 1) {
      setResolvedAccountId(accountIds[0]!);
      const positions = await window.desktop.portfolio.listPositions(accountIds[0]);
      const match = positions.find((item) => item.symbol === position.symbol);
      setAvailableQuantity(match?.quantity ?? position.quantity);
      return;
    }

    setResolvedAccountId(null);
    setAvailableQuantity(position.quantity);
  }, [accountId, position]);

  useEffect(() => {
    if (!open || !position) {
      form.resetFields();
      setActiveFraction(null);
      setResolvedAccountId(null);
      setAvailableQuantity(null);
      return;
    }

    void resolveAccount().then(() => {
      form.setFieldsValue({
        accountId: !accountId || isAllAccountsId(accountId) ? undefined : accountId,
        price: position.marketPrice ?? position.avgPrice,
        quantity: roundSellQuantity(position.quantity, position.kind),
        fees: 0,
        tradeAt: defaultTradeAt(),
        reviewAfterSave: true,
      });
      setActiveFraction(1);
    });
  }, [accountId, form, open, position, resolveAccount]);

  const applyFraction = (fraction: number): void => {
    if (!position) return;
    const quantity = quantityFromFraction(maxQuantity, fraction, position.kind);
    form.setFieldValue('quantity', quantity);
    setActiveFraction(fraction);
  };

  const quantityLabel = useMemo(
    () => (position ? `数量（最多 ${formatQuantityForKind(maxQuantity, position.kind)}）` : '数量'),
    [maxQuantity, position],
  );

  const submit = async (): Promise<void> => {
    if (!position) return;
    const values = await form.validateFields();
    const sellAccountId = values.accountId ?? resolvedAccountId;
    if (!sellAccountId) {
      void message.warning('请选择交易账户');
      return;
    }

    const quantity = roundSellQuantity(values.quantity, kind);
    if (quantity <= 0) {
      void message.warning('卖出数量必须大于 0');
      return;
    }
    if (quantity > maxQuantity + 1e-8) {
      void message.warning(`卖出数量不能超过持仓 ${formatQuantityForKind(maxQuantity, kind)}`);
      return;
    }

    setSaving(true);
    try {
      let reviewDraft: JournalReviewDraft | null = null;
      if (values.reviewAfterSave) {
        reviewDraft = {
          symbol: position.symbol,
          title: `${position.name} · 卖出复盘`,
          direction: 'long',
          planned: false,
          entryPrice: position.avgCost,
          exitPrice: values.price,
          quantity,
          fees: values.fees ?? 0,
          tradeAt: tradeAtToIso(values.tradeAt),
        };
      }

      await window.desktop.portfolio.addLedgerEntry({
        accountId: sellAccountId,
        symbol: position.symbol,
        kind: position.kind,
        side: 'sell',
        quantity,
        price: values.price,
        fees: values.fees ?? 0,
        tradeAt: tradeAtToIso(values.tradeAt),
        note: values.note?.trim(),
        source: 'manual',
      });

      void message.success('卖出记录已保存');
      onSaved();
      onClose();

      if (reviewDraft) {
        void navigate(routePaths.journal, { state: { openReview: true, reviewDraft } });
      }
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const estimateFees = async (): Promise<void> => {
    const sellAccountId = form.getFieldValue('accountId') ?? resolvedAccountId;
    const currentPrice = form.getFieldValue('price') as number | undefined;
    const currentQuantity = form.getFieldValue('quantity') as number | undefined;

    if (!sellAccountId || !position) {
      void message.warning('请先选择账户');
      return;
    }
    if (!currentPrice || !currentQuantity) {
      void message.warning('请先填写成交价和数量');
      return;
    }

    setEstimating(true);
    try {
      const result = await window.desktop.accounts.estimateFeesForSymbol({
        accountId: sellAccountId,
        side: 'sell',
        symbol: position.symbol,
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

  return (
    <Modal
      title={position ? `卖出 · ${position.name}` : '卖出'}
      open={open}
      okText="确认卖出"
      cancelText="取消"
      confirmLoading={saving}
      onCancel={onClose}
      onOk={() => void submit()}
      destroyOnHidden
      width={560}
    >
      {position ? (
        <Form<FormValues> form={form} layout="vertical" className="trading-form portfolio-ledger-form">
          {isAllAccountsId(accountId) ? (
            <Form.Item label="交易账户" name="accountId" rules={[{ required: true, message: '请选择账户' }]}>
              <AccountSelect />
            </Form.Item>
          ) : null}

          <div className="position-sell-summary">
            <span>
              可卖 {formatQuantityForKind(maxQuantity, kind)} · 成本{' '}
              {formatPriceForKind(position.avgPrice, kind)} · 现价{' '}
              {position.marketPrice === null ? '—' : formatPriceForKind(position.marketPrice, kind)}
            </span>
          </div>

          <Form.Item label="快捷仓位">
            <Segmented
              options={SELL_FRACTION_PRESETS.map((preset) => ({
                label: preset.label,
                value: preset.fraction,
              }))}
              value={activeFraction ?? undefined}
              onChange={(value) => applyFraction(Number(value))}
            />
          </Form.Item>

          <div className="portfolio-form-row">
            <Form.Item
              label={quantityLabel}
              name="quantity"
              rules={[{ required: true, message: '请输入卖出数量' }]}
            >
              <InputNumber
                className="full-width-input"
                min={kind === 'otc_fund' ? 0.0001 : 1}
                precision={kind === 'otc_fund' ? 4 : 0}
                step={kind === 'otc_fund' ? 0.0001 : 1}
                onChange={() => setActiveFraction(null)}
              />
            </Form.Item>
            <Form.Item label="成交价" name="price" rules={[{ required: true, message: '请输入成交价' }]}>
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
              <TradeDatePicker className="full-width-input" />
            </Form.Item>
          </div>

          <Form.Item name="reviewAfterSave" valuePropName="checked">
            <Checkbox>保存后去复盘</Checkbox>
          </Form.Item>

          <Form.Item label="备注" name="note">
            <Input.TextArea rows={2} maxLength={500} placeholder="可选" />
          </Form.Item>
        </Form>
      ) : null}
    </Modal>
  );
}
