import { Select } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import type { TradingAccountSummary } from '../../../shared/api.types';
import { ALL_ACCOUNTS_ID } from '../../../shared/accounts/constants';
import { formatAccountSelectLabel } from '../../../shared/accounts/account-display';
import { AccountSelectOptionLabel } from './AccountSelectOption';

interface AccountSelectProps {
  value?: string;
  onChange?: (accountId: string) => void;
  includeArchived?: boolean;
  /** 是否在列表顶部加入「全部账户汇总」选项。 */
  includeAllOption?: boolean;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  allowClear?: boolean;
}

/** 交易账户下拉选择器（含券商图标）。 */
export function AccountSelect({
  value,
  onChange,
  includeArchived = false,
  includeAllOption = false,
  disabled,
  className,
  placeholder = '选择账户',
  allowClear = false,
}: AccountSelectProps): React.JSX.Element {
  const [accounts, setAccounts] = useState<TradingAccountSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void window.desktop.accounts
      .list(includeArchived)
      .then((list) => {
        if (active) setAccounts(list);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [includeArchived]);

  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);

  const renderAccountOption = (accountId: string | undefined): React.ReactNode => {
    if (accountId === ALL_ACCOUNTS_ID) {
      return <AccountSelectOptionLabel allAccounts />;
    }
    const account = accountId ? accountById.get(accountId) : undefined;
    return account ? <AccountSelectOptionLabel account={account} /> : null;
  };

  return (
    <Select
      className={className ? `account-select ${className}` : 'account-select'}
      getPopupContainer={(trigger) => trigger.ownerDocument.body}
      loading={loading}
      disabled={disabled}
      placeholder={placeholder}
      value={value}
      allowClear={allowClear}
      onChange={(next) => {
        if (next) onChange?.(next);
      }}
      options={[
        ...(includeAllOption
          ? [{ value: ALL_ACCOUNTS_ID, label: '全部账户汇总' }]
          : []),
        ...accounts.map((account) => ({
          value: account.id,
          label: formatAccountSelectLabel(account),
          disabled: account.isArchived,
        })),
      ]}
      optionRender={(option) => renderAccountOption(String(option.value ?? ''))}
      labelRender={(option) => renderAccountOption(String(option.value ?? value ?? ''))}
    />
  );
}
