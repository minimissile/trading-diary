import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Form, Image, Input, InputNumber, Modal, Radio, Segmented } from 'antd';
import type { Dayjs } from 'dayjs';
import type { InstrumentInfo, MarketQuote, TradingAccountSummary } from '../../../shared/api.types';
import type { PortfolioLedgerEntry } from '../../../shared/portfolio/types';
import { LEDGER_IMPORT_ASSET_KIND_LABELS, type LedgerAiImportAssetKind } from '../../../shared/portfolio/ledger-import-types';
import { CameraOutlined } from '@ant-design/icons';
import { tradeSnapshotKey, type TradeSnapshotInput } from '../../../shared/chart/trade-snapshot';
import { SymbolSearchInput } from './SymbolSearchInput';
import { AccountSelect } from './AccountSelect';
import { LedgerTradeContextPanel } from './LedgerTradeContextPanel';
import { TradeDatePicker } from './TradeDatePicker';
import { defaultTradeAt, parseTradeAt, tradeAtToIso } from '../../lib/trade-date';

interface PortfolioLedgerModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  defaultAccountId?: string;
  /** 编辑已有流水时为非空。 */
  editingEntry?: PortfolioLedgerEntry | null;
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

export function PortfolioLedgerModal(props: PortfolioLedgerModalProps): React.JSX.Element {
  return props.open ? <PortfolioLedgerModalContent key={props.editingEntry?.id ?? props.defaultAccountId} {...props} /> : <></>;
}

function PortfolioLedgerModalContent({
  open,
  onClose,
  onSaved,
  defaultAccountId,
  editingEntry = null,
}: PortfolioLedgerModalProps): React.JSX.Element {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const activeRef = useRef(true);
  const [snapshot, setSnapshot] = useState<{ key: string; dataUrl: string } | null>(() => {
    if (!editingEntry?.chartSnapshot) return null;
    return { dataUrl: editingEntry.chartSnapshot, key: tradeSnapshotKey({ ...editingEntry,
      name: editingEntry.symbol, side: editingEntry.side === 'sell' ? 'sell' : 'buy' }) };
  });
  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      void window.desktop.tradeSnapshot.cancel().catch(() => undefined);
    };
  }, []);
  const [estimating, setEstimating] = useState(false);
  const [resolved, setResolved] = useState<InstrumentInfo | null>(null);
  const [resolving, setResolving] = useState(false);
  const [quote, setQuote] = useState<MarketQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [accounts, setAccounts] = useState<TradingAccountSummary[]>([]);
  const [ledgerAssetKind, setLedgerAssetKind] = useState<LedgerAiImportAssetKind>(
    editingEntry?.kind === 'otc_fund' ? 'fund' : 'stock',
  );

  const accountId = Form.useWatch('accountId', form);
  const marketScopes = useMemo(() => {
    const account = accounts.find((item) => item.id === accountId);
    if (account?.marketScope?.length) return account.marketScope;
    return ['CN_A'];
  }, [accounts, accountId]);

  const selectedAccountKind = accounts.find((item) => item.id === accountId)?.accountKind;
  useEffect(() => {
    if (!open || editingEntry || !selectedAccountKind) return;
    // Synchronize Ant Design's external form store and its resolved account with the quote editor.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLedgerAssetKind(selectedAccountKind === 'fund' ? 'fund' : 'stock');
    form.setFieldValue('symbol', undefined);
    setResolved(null);
    setQuote(null);
    setResolving(false);
  }, [accountId, selectedAccountKind, open, editingEntry, form]);

  const symbolPlaceholder =
    marketScopes.includes('HK') || marketScopes.includes('US')
      ? '如 00700、06060、AAPL（搜公司名，非券商名）'
      : '如 600941、510300、161725';

  const side = Form.useWatch('side', form);
  const price = Form.useWatch('price', form);
  const quantity = Form.useWatch('quantity', form);
  const tradeAt = Form.useWatch('tradeAt', form);
  const symbolValue = Form.useWatch('symbol', form);
  const fees = Form.useWatch('fees', form);

  const snapshotInput = (values: FormValues): TradeSnapshotInput => ({
    accountId: values.accountId, symbol: values.symbol.trim().toUpperCase(),
    name: resolved?.name ?? editingEntry?.symbol ?? values.symbol,
    venue: editingEntry?.venue ?? (ledgerAssetKind === 'fund' ? 'OTC' : resolved!.venue),
    kind: editingEntry?.kind ?? (ledgerAssetKind === 'fund' ? 'otc_fund' : resolved!.kind),
    side: values.side, quantity: values.quantity, price: values.price, fees: values.fees ?? 0,
    tradeAt: tradeAtToIso(values.tradeAt), editingId: editingEntry?.id,
  });
  const snapshotReady = Boolean(accountId && symbolValue && (editingEntry || (resolved?.symbol === symbolValue.trim().toUpperCase() && !resolving))
    && (side === 'buy' || side === 'sell') && price > 0 && quantity > 0 && (fees ?? 0) >= 0 && tradeAt?.isValid());
  const currentSnapshotKey = snapshotReady ? tradeSnapshotKey(snapshotInput(form.getFieldsValue())) : null;
  const attachedSnapshot = snapshot?.key === currentSnapshotKey ? snapshot?.dataUrl : null;

  const captureSnapshot = async (): Promise<void> => {
    let values: FormValues;
    try { values = await form.validateFields(); } catch { return; }
    if (!snapshotReady) return;
    const input = snapshotInput(values);
    const key = tradeSnapshotKey(input);
    setCapturing(true);
    try {
      const dataUrl = await window.desktop.tradeSnapshot.open(input);
      if (!activeRef.current) return;
      setSnapshot({ key, dataUrl });
      void message.success('交易 K 线快照已回填，保存流水时一并保存');
    } catch (reason) {
      if (activeRef.current) void message.error(reason instanceof Error ? reason.message : '快照生成失败');
    } finally {
      if (activeRef.current) setCapturing(false);
    }
  };

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
    if (!open) return;
    let active = true;
    void window.desktop.accounts.list().then((list) => {
      if (active) setAccounts(list);
    });
    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    if (editingEntry) {
      form.setFieldsValue({
        accountId: editingEntry.accountId,
        symbol: editingEntry.symbol,
        side: editingEntry.side === 'dividend_reinvest' ? 'buy' : editingEntry.side,
        quantity: editingEntry.quantity,
        price: editingEntry.price,
        fees: editingEntry.fees,
        tradeAt: parseTradeAt(editingEntry.tradeAt),
        note: editingEntry.note,
      });
      void window.desktop.market
        .resolve(editingEntry.symbol)
        .then((instrument) => {
          setResolved(instrument);
          return loadQuote(instrument.symbol);
        })
        .catch(() => {
          setResolved(null);
        });
      return;
    }

    form.setFieldsValue({
      accountId: defaultAccountId,
      side: 'buy',
      fees: 0,
      tradeAt: defaultTradeAt(),
    });
  }, [defaultAccountId, editingEntry, form, loadQuote, open]);

  const submit = async (): Promise<void> => {
    const values = await form.validateFields();
    const symbol = values.symbol.trim().toUpperCase();
    if (!editingEntry && (!resolved || resolved.symbol !== symbol || resolving)) {
      void message.warning('请先选择当前交易渠道下的有效标的');
      return;
    }
    setSaving(true);
    try {
      if (editingEntry) {
        await window.desktop.portfolio.updateLedgerEntry(editingEntry.id, {
          side: values.side,
          quantity: values.quantity,
          price: values.price,
          fees: values.fees ?? 0,
          tradeAt: tradeAtToIso(values.tradeAt),
          note: values.note?.trim(),
          chartSnapshot: attachedSnapshot ?? null,
        });
        void message.success('流水已更新');
      } else {
        const kind = ledgerAssetKind === 'fund' ? 'otc_fund' : resolved?.kind;
        const venue = ledgerAssetKind === 'fund' ? ('OTC' as const) : resolved?.venue;
        await window.desktop.portfolio.addLedgerEntry({
          accountId: values.accountId,
          symbol,
          kind,
          venue,
          side: values.side,
          quantity: values.quantity,
          price: values.price,
          fees: values.fees ?? 0,
          tradeAt: tradeAtToIso(values.tradeAt),
          note: values.note?.trim(),
          chartSnapshot: attachedSnapshot ?? null,
          source: 'manual',
        });
        void message.success(values.side === 'buy' ? '买入记录已保存' : '卖出记录已保存');
      }

      onSaved();
      onClose();

    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '保存失败');
    } finally {
      setSaving(false);
    }
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
      title={editingEntry ? '编辑持仓流水' : '录入持仓流水'}
      open={open}
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      okButtonProps={{ disabled: capturing }}
      onCancel={onClose}
      onOk={() => void submit()}
      destroyOnHidden
      width={680}
    >
      <Form<FormValues> form={form} layout="vertical" className="trading-form portfolio-ledger-form">
        <Form.Item label="交易账户" name="accountId" rules={[{ required: true, message: '请选择账户' }]}>
          <AccountSelect disabled={Boolean(editingEntry)} />
        </Form.Item>

        {!editingEntry ? (
          <>
            <Form.Item label="交易渠道">
              <Segmented
                value={ledgerAssetKind}
                onChange={(value) => {
                  setLedgerAssetKind(value as LedgerAiImportAssetKind);
                  form.setFieldValue('symbol', undefined);
                  setResolved(null);
                  setQuote(null);
                  setResolving(false);
                }}
                options={[
                  { label: LEDGER_IMPORT_ASSET_KIND_LABELS.stock, value: 'stock' },
                  { label: LEDGER_IMPORT_ASSET_KIND_LABELS.fund, value: 'fund' },
                ]}
              />
            </Form.Item>
            <p className="ledger-ai-import-hint ledger-ai-import-hint--compact">
              {ledgerAssetKind === 'fund'
                ? '蚂蚁、天天基金等场外申购/定投请选「场外基金」。搜索仅显示场外基金。'
                : '券商 App 场内买卖（含 LOF、ETF）请选「股票（含场内基金）」。'}
            </p>
          </>
        ) : null}

        <Form.Item
          className="symbol-field"
          label="标的代码"
          name="symbol"
          rules={[{ required: true, message: '请输入标的代码' }]}
          extra={resolved || resolving ? undefined : '输入代码或名称，可选择搜索建议'}
        >
          <SymbolSearchInput
            placeholder={symbolPlaceholder}
            key={`${accountId}:${ledgerAssetKind}`}
            marketScopes={marketScopes}
            assetKind={ledgerAssetKind}
            disabled={Boolean(editingEntry)}
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
                void message.warning('未找到当前交易渠道下的标的，请从搜索结果选择');
              }
            }}
          />
        </Form.Item>

        {resolved ? (
          <LedgerTradeContextPanel
            instrument={
              ledgerAssetKind === 'fund' ? { ...resolved, kind: 'otc_fund', venue: 'OTC', quoteCurrency: 'CNY' } : resolved
            }
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
          <Form.Item
            label="成交价"
            name="price"
            rules={[{ required: true, message: '请输入价格' }]}
            extra={side === 'buy' ? '不含佣金净价的成交均价；勿填摊薄成本' : undefined}
          >
            <InputNumber className="full-width-input" min={0.0001} precision={4} />
          </Form.Item>
        </div>

        {side === 'buy' && price && quantity ? (
          <p className="portfolio-ledger-amortized-cost">
            摊薄成本（含费用） {((price * quantity + (form.getFieldValue('fees') ?? 0)) / quantity).toFixed(4)} 元/份
          </p>
        ) : null}

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
              <span>{snapshotReady ? '加载历史买卖点及本次交易后自动截图' : '请先填写账户、标的、方向、数量、成交价和成交时间'}</span>
            </div>
            {attachedSnapshot ? <Image src={attachedSnapshot} alt="本笔交易的 K 线快照" /> : null}
            {snapshot && !attachedSnapshot ? <span>交易信息已变更，请重新生成快照。</span> : null}
          </div>
        </Form.Item>

        <Form.Item label="备注" name="note">
          <Input.TextArea rows={2} maxLength={500} placeholder="可选" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
