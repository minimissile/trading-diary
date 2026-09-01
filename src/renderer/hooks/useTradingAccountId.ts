import { useMemo, useState } from 'react';
import { useAccountsQuery } from '../lib/queries';

/** 加载默认交易账户，并支持切换当前账户。 */
export function useTradingAccountId(): [string | undefined, (id: string) => void] {
  const { accounts } = useAccountsQuery(false);
  const [override, setOverride] = useState<string | undefined>();

  const defaultId = useMemo(() => {
    const account = accounts.find((item) => item.isDefault) ?? accounts[0];
    return account?.id;
  }, [accounts]);

  return [override ?? defaultId, setOverride];
}
