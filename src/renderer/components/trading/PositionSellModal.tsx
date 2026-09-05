import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Form, Image, Input, InputNumber, Modal, Segmented } from 'antd';
import type { Dayjs } from 'dayjs';
import type { PortfolioPositionView } from '../../../shared/portfolio/types';
import { ALL_ACCOUNTS_ID, isAllAccountsId } from '../../../shared/accounts/constants';
import { quantityFromFraction, roundSellQuantity, SELL_FRACTION_PRESETS } from '../../../shared/portfolio/sell-quantity';
import { CameraOutlined } from '@ant-design/icons';
import { tradeSnapshotKey, type TradeSnapshotInput } from '../../../shared/chart/trade-snapshot';
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
}

export function PositionSellModal(props: PositionSellModalProps): React.JSX.Element {
  return props.open ? <PositionSellModalContent key={props.position?.symbol + ':' + props.accountId} {...props} /> : <></>;
}

function PositionSellModalContent({ open, position, accountId, onClose, onSaved }: PositionSellModalProps): React.JSX.Element {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [activeFraction, setActiveFraction] = useState<number | null>(null);
  const [resolvedAccountId, setResolvedAccountId] = useState<string | null>(null);
  const [accountHoldings, setAccountHoldings] = useState<Array<{ id: string; quantity: number }>>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [snapshot, setSnapshot] = useState<{ key: string; dataUrl: string } | null>(null);
  const activeRef = useRef(true);
  useEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; void window.desktop.tradeSnapshot.cancel().catch(() => undefined); };
  }, []);
  const [availableQuantity, setAvailableQuantity] = useState<number | null>(null);

  const kind = position?.kind ?? 'stock';
  const maxQuantity = availableQuantity ?? position?.quantity ?? 0;

  const resolveAccount = useCallback(async (): Promise<{ id: string | null; quantity: number }> => {
    if (!position) return { id: null, quantity: 0 };
    if (accountId && !isAllAccountsId(accountId)) {
      return { id: accountId, quantity: position.quantity };
    }
    const entries = await window.desktop.portfolio.listLedgerEntries(ALL_ACCOUNTS_ID, position.symbol);
    const quantities = new Map<string, number>();
    for (const entry of entries) {
      if (entry.venue !== position.venue || entry.kind !== position.kind) continue;
      quantities.set(entry.accountId, (quantities.get(entry.accountId) ?? 0)
        + (entry.side === 'sell' ? -Math.abs(entry.quantity) : Math.abs(entry.quantity)));
    }
    const holdings = [...quantities].filter(([, quantity]) => quantity > 1e-8)
      .map(([id, quantity]) => ({ id, quantity }));
    if (activeRef.current) setAccountHoldings(holdings);
    return holdings.length === 1 ? holdings[0]! : { id: null, quantity: 0 };
  }, [accountId, position]);

  useEffect(() => {
    if (!open || !position) return;
    let active = true;
    void resolveAccount().then((account) => {
      if (!active) return;
      setResolvedAccountId(account.id);
      setAvailableQuantity(account.quantity);
      form.setFieldsValue({
        accountId: account.id ?? undefined,
        price: position.marketPrice ?? position.avgPrice,
        quantity: account.id ? roundSellQuantity(account.quantity, position.kind) : undefined,
        fees: 0,
        tradeAt: defaultTradeAt(),
      });
      setActiveFraction(account.id ? 1 : null);
    }).catch((reason: unknown) => {
      if (active) void message.error(reason instanceof Error ? reason.message : '账户加载失败，请重新打开卖出窗口');
    }).finally(() => { if (active) setLoadingAccounts(false); });
    return () => { active = false; };
  }, [form, message, open, position, resolveAccount]);

  const watchedAccountId = Form.useWatch('accountId', form);
  const watchedQuantity = Form.useWatch('quantity', form);
  const watchedPrice = Form.useWatch('price', form);
  const watchedFees = Form.useWatch('fees', form);
  const watchedTradeAt = Form.useWatch('tradeAt', form);
  const snapshotInput = (values: FormValues): TradeSnapshotInput => ({
    accountId: values.accountId, symbol: position!.symbol, name: position!.name,
    venue: position!.venue, kind: position!.kind, side: 'sell',
    quantity: roundSellQuantity(values.quantity, kind), price: values.price,
    fees: values.fees ?? 0, tradeAt: tradeAtToIso(values.tradeAt),
  });
  const snapshotReady = Boolean(!loadingAccounts && position && watchedAccountId && watchedQuantity > 0
    && watchedQuantity <= maxQuantity + 1e-8 && watchedPrice > 0 && (watchedFees ?? 0) >= 0 && watchedTradeAt?.isValid());
  const currentKey = snapshotReady ? tradeSnapshotKey(snapshotInput(form.getFieldsValue())) : null;
  const attachedSnapshot = snapshot?.key === currentKey ? snapshot?.dataUrl : null;
  const captureSnapshot = async (): Promise<void> => {
    let values: FormValues;
    try { values = await form.validateFields(); } catch { return; }
    if (!snapshotReady) return;
    const input = snapshotInput(values);
    setCapturing(true);
    try {
      const dataUrl = await window.desktop.tradeSnapshot.open(input);
      if (activeRef.current) setSnapshot({ key: tradeSnapshotKey(input), dataUrl });
    } catch (reason) {
      if (activeRef.current) void message.error(reason instanceof Error ? reason.message : '快照生成失败');
    } finally { if (activeRef.current) setCapturing(false); }
  };

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
      await window.desktop.portfolio.addLedgerEntry({
        accountId: sellAccountId,
        symbol: position.symbol,
        kind: position.kind,
        venue: position.venue,
        chartSnapshot: attachedSnapshot ?? null,
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

    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const estimateFees = async (): Promise<void> => {
    const sellAccountId = (form.getFieldValue('accountId') as string | undefined) ?? resolvedAccountId;
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
      okButtonProps={{ disabled: capturing || loadingAccounts }}
      onCancel={onClose}
      onOk={() => void submit()}
      destroyOnHidden
      width={560}
    >
      {position ? (
        <Form<FormValues> form={form} layout="vertical" className="trading-form portfolio-ledger-form">
          <Form.Item label="交易账户" name="accountId" rules={[{ required: true, message: '请选择账户' }]}
            extra={accountHoldings.length > 1 ? '该标的在多个账户有持仓，请选择本次卖出的账户' : undefined}>
            <AccountSelect
              disabled={loadingAccounts || Boolean(accountId && !isAllAccountsId(accountId))}
              accountIds={accountId && !isAllAccountsId(accountId) ? [accountId] : accountHoldings.map((item) => item.id)}
              onChange={(id) => {
                const holding = accountHoldings.find((item) => item.id === id);
                setResolvedAccountId(id);
                setAvailableQuantity(holding?.quantity ?? 0);
                form.setFieldValue('quantity', holding ? roundSellQuantity(holding.quantity, kind) : undefined);
                setActiveFraction(holding ? 1 : null);
              }}
            />
          </Form.Item>

          <div className="position-sell-summary">
            <span>
              可卖 {formatQuantityForKind(maxQuantity, kind)} · 成本 {formatPriceForKind(position.avgPrice, kind)} · 现价{' '}
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
            <Form.Item label={quantityLabel} name="quantity" rules={[{ required: true, message: '请输入卖出数量' }]}>
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

          <Form.Item label="交易 K 线快照">
            <div className="ledger-chart-snapshot">
              <div className="ledger-chart-snapshot-actions">
                <Button icon={<CameraOutlined />} loading={capturing} disabled={!snapshotReady || saving} onClick={() => void captureSnapshot()}>
                  {attachedSnapshot ? '重新生成快照' : '交易 K 线快照'}
                </Button>
                <span>{snapshotReady ? '加载历史买卖点和本次卖出点后自动截图' : '请先填写交易账户、数量、成交价和成交时间'}</span>
              </div>
              {attachedSnapshot ? <Image src={attachedSnapshot} alt="本次卖出的 K 线快照" /> : null}
              {snapshot && !attachedSnapshot ? <span>交易信息已变更，请重新生成快照。</span> : null}
            </div>
          </Form.Item>

          <Form.Item label="备注" name="note">
            <Input.TextArea rows={2} maxLength={500} placeholder="可选" />
          </Form.Item>
        </Form>
      ) : null}
    </Modal>
  );
}
