import { BankOutlined } from '@ant-design/icons';
import type { TradingAccountSummary } from '../../../shared/api.types';
import { formatAccountSelectLabel } from '../../../shared/accounts/account-display';
import { BrokerAvatar } from './BrokerAvatar';

export type AccountSelectOptionAccount = Pick<TradingAccountSummary, 'name' | 'broker' | 'isDefault'>;

interface AccountSelectOptionLabelProps {
  account?: AccountSelectOptionAccount;
  /** 展示「全部账户汇总」占位项。 */
  allAccounts?: boolean;
  size?: number;
}

/** 账户选择器中的选项行（券商图标 + 文案）。 */
export function AccountSelectOptionLabel({
  account,
  allAccounts = false,
  size = 18,
}: AccountSelectOptionLabelProps): React.JSX.Element {
  return (
    <span className="account-select-option">
      {allAccounts ? (
        <span
          className="account-select-icon account-select-icon--all"
          style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.62)) }}
          aria-hidden="true"
        >
          <BankOutlined />
        </span>
      ) : account ? (
        <BrokerAvatar brokerId={account.broker} className="account-select-icon" size={size} />
      ) : null}
      <span className="account-select-option-label">
        {allAccounts ? '全部账户汇总' : account ? formatAccountSelectLabel(account) : '—'}
      </span>
    </span>
  );
}
