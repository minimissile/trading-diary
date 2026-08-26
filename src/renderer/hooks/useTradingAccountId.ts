import { useEffect, useState } from 'react';

/** 加载默认交易账户，并支持切换当前账户。 */
export function useTradingAccountId(): [string | undefined, (id: string) => void] {
  const [accountId, setAccountId] = useState<string | undefined>();

  useEffect(() => {
    void window.desktop.accounts.list().then((accounts) => {
      const defaultAccount = accounts.find((item) => item.isDefault) ?? accounts[0];
      if (defaultAccount) setAccountId(defaultAccount.id);
    });
  }, []);

  return [accountId, setAccountId];
}
