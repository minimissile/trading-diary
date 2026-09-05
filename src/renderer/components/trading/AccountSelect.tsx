import { Select } from 'antd';
import { useMemo } from 'react';
import { ALL_ACCOUNTS_ID } from '../../../shared/accounts/constants';
import { formatAccountSelectLabel } from '../../../shared/accounts/account-display';
import { useAccountsQuery } from '../../lib/queries';
import { AccountSelectOptionLabel } from './AccountSelectOption';

interface AccountSelectProps {
  value?: string;
  onChange?: (accountId: string) => void;
  includeArchived?: boolean;
  /** 限定可选账户；空数组表示无可选账户。 */
  accountIds?: readonly string[];
  /** 是否在列表顶部加入「全部账户汇总」选项。 */
  includeAllOption?: boolean;
  disabled?: boolean;
  className?: string;
  popupClassName?: string;
  placeholder?: string;
  allowClear?: boolean;
}

/** 交易账户下拉选择器（含券商图标）。 */
export function AccountSelect({
  value,
  onChange,
  includeArchived = false,
  accountIds,
  includeAllOption = false,
  disabled,
  className,
  popupClassName,
  placeholder = '选择账户',
  allowClear = false,
}: AccountSelectProps): React.JSX.Element {
  const { accounts, isLoading: loading } = useAccountsQuery(includeArchived);

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
      classNames={popupClassName ? { popup: { root: popupClassName } } : undefined}
      getPopupContainer={(trigger: HTMLElement) => trigger.ownerDocument.body}
      loading={loading}
      disabled={disabled}
      placeholder={placeholder}
      value={value}
      allowClear={allowClear}
      onChange={(next) => {
        if (next) onChange?.(next);
      }}
      options={[
        ...(includeAllOption ? [{ value: ALL_ACCOUNTS_ID, label: '全部账户汇总' }] : []),
        ...accounts.filter((account) => !accountIds || accountIds.includes(account.id)).map((account) => ({
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
