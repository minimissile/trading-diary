import { useEffect, useState } from 'react';
import { App, Checkbox, Modal, Radio } from 'antd';
import type { PortfolioDividendRecord } from '../../../shared/api.types';
import { dividendPayoutModeLabel, type DividendPayoutMode } from '../../../shared/portfolio/dividend-payout';
import { ValueDisplay } from '../../lib/trading-format';

interface DividendPayoutModeModalProps {
  open: boolean;
  record: PortfolioDividendRecord | null;
  listAccountId: string;
  year: number;
  onClose: () => void;
  onSaved: (records: PortfolioDividendRecord[]) => void;
}

/**
 * 切换单条分红记录的分红方式，并可同步更新标的默认方式。
 */
export function DividendPayoutModeModal({
  open,
  record,
  listAccountId,
  year,
  onClose,
  onSaved,
}: DividendPayoutModeModalProps): React.JSX.Element {
  const { message } = App.useApp();
  const [payoutMode, setPayoutMode] = useState<DividendPayoutMode>('cash');
  const [setDefault, setSetDefault] = useState(true);
  const [defaultMode, setDefaultMode] = useState<DividendPayoutMode | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !record) return;
    setPayoutMode(record.payoutMode);
    setSetDefault(true);
    void window.desktop.portfolio.getDividendPayoutDefault(record.accountId, record.symbol).then(setDefaultMode);
  }, [open, record]);

  const save = async (): Promise<void> => {
    if (!record) return;
    setSaving(true);
    try {
      const next = await window.desktop.portfolio.setDividendPayoutMode(record.id, payoutMode, setDefault, listAccountId, year);
      onSaved(next);
      void message.success(
        payoutMode === 'reinvest' && record.status === 'confirmed' ? '分红方式已更新，持仓份额已同步' : '分红方式已更新',
      );
      onClose();
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '更新失败');
    } finally {
      setSaving(false);
    }
  };

  if (!record) {
    return <></>;
  }

  const modeLabel = dividendPayoutModeLabel(payoutMode);
  const effectiveDefault = defaultMode ?? 'cash';
  const savedDefaultLabel = dividendPayoutModeLabel(effectiveDefault);

  return (
    <Modal
      rootClassName="dividend-overlay"
      title="分红方式"
      open={open}
      onCancel={onClose}
      onOk={() => void save()}
      confirmLoading={saving}
      okText="保存"
      cancelText="取消"
      destroyOnHidden
    >
      <div className="portfolio-dividend-payout-modal-intro">
        <strong>
          {record.name}（{record.symbol}）
        </strong>
        <p>
          除权日 {record.exDividendDate} · 税前 <ValueDisplay kind="currency" value={record.cashAmount} />
          {record.payoutMode === 'reinvest' && record.reinvestQuantity !== null ? (
            <>
              {' '}
              · 再投 <ValueDisplay kind="quantity" value={record.reinvestQuantity} /> 份
            </>
          ) : null}
        </p>
      </div>

      <p className="portfolio-dividend-payout-modal-label">本次分红</p>
      <Radio.Group
        value={payoutMode}
        onChange={(event) => {
          setPayoutMode(event.target.value as DividendPayoutMode);
          setSetDefault(true);
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <Radio value="cash">现金分红 — 计入现金收益，不增加份额</Radio>
        <Radio value="reinvest">红利再投资 — 按除权日净值折算份额</Radio>
      </Radio.Group>

      {payoutMode === 'reinvest' && record.status !== 'confirmed' ? (
        <p className="portfolio-dividend-payout-modal-hint">待确认记录在确认后，才会按净值增加持仓份额。</p>
      ) : null}

      <p className="portfolio-dividend-payout-modal-label">默认设置</p>
      <Checkbox checked={setDefault} onChange={(event) => setSetDefault(event.target.checked)}>
        以后 {record.symbol} 的新分红也默认按「{modeLabel}」处理
      </Checkbox>
      {effectiveDefault !== payoutMode ? (
        <p className="portfolio-dividend-payout-modal-hint">当前默认为「{savedDefaultLabel}」，勾选并保存后将更新。</p>
      ) : null}
    </Modal>
  );
}
