import { useEffect, useState } from 'react';
import { App, Checkbox, Modal, Radio } from 'antd';
import type { PortfolioDividendRecord } from '../../../shared/api.types';
import {
  dividendPayoutModeLabel,
  type DividendPayoutMode,
} from '../../../shared/portfolio/dividend-payout';
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
  const [setDefault, setSetDefault] = useState(false);
  const [defaultMode, setDefaultMode] = useState<DividendPayoutMode | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !record) return;
    setPayoutMode(record.payoutMode);
    setSetDefault(false);
    void window.desktop.portfolio.getDividendPayoutDefault(record.accountId, record.symbol).then(setDefaultMode);
  }, [open, record]);

  const save = async (): Promise<void> => {
    if (!record) return;
    setSaving(true);
    try {
      const next = await window.desktop.portfolio.setDividendPayoutMode(
        record.id,
        payoutMode,
        setDefault,
        listAccountId,
        year,
      );
      onSaved(next);
      void message.success(
        payoutMode === 'reinvest' && record.status === 'confirmed'
          ? '分红方式已更新，持仓份额已同步'
          : '分红方式已更新',
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

  const modeChanged = payoutMode !== record.payoutMode;
  const defaultLabel = dividendPayoutModeLabel(payoutMode);

  return (
    <Modal
      title="切换分红方式"
      open={open}
      onCancel={onClose}
      onOk={() => void save()}
      confirmLoading={saving}
      okText="保存"
      cancelText="取消"
      destroyOnHidden
    >
      <p className="portfolio-dividend-payout-modal-intro">
        {record.name}（{record.symbol}）· 除权日 {record.exDividendDate} · 税前{' '}
        <ValueDisplay kind="currency" value={record.cashAmount} />
      </p>

      <Radio.Group
        value={payoutMode}
        onChange={(event) => setPayoutMode(event.target.value as DividendPayoutMode)}
        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <Radio value="cash">现金分红</Radio>
        <Radio value="reinvest">红利再投资</Radio>
      </Radio.Group>

      {payoutMode === 'reinvest' && record.status !== 'confirmed' ? (
        <p className="portfolio-dividend-payout-modal-hint">
          待确认分红会在确认后，再按除权/到账日净值增加持仓份额。
        </p>
      ) : null}

      {modeChanged || defaultMode !== payoutMode ? (
        <Checkbox
          checked={setDefault}
          onChange={(event) => setSetDefault(event.target.checked)}
          style={{ marginTop: 16 }}
        >
          同时将 {record.symbol} 的默认分红方式设为「{defaultLabel}」
        </Checkbox>
      ) : null}
    </Modal>
  );
}
