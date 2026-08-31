import { useQuery } from '@tanstack/react-query';
import type { TradingAccountSummary, FeeProfile } from '../../../shared/api.types';
import { queryKeys } from './keys';

export function useAccountsQuery(includeArchived = false): {
  accounts: TradingAccountSummary[];
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: queryKeys.accounts.list(includeArchived),
    queryFn: () => window.desktop.accounts.list(includeArchived),
  });
  return { accounts: query.data ?? [], isLoading: query.isLoading };
}

export function useAccountsPageQuery(includeArchived: boolean): {
  accounts: TradingAccountSummary[];
  feeProfiles: FeeProfile[];
  isLoading: boolean;
  refetch: () => Promise<void>;
} {
  const query = useQuery({
    queryKey: queryKeys.accounts.page(includeArchived),
    queryFn: async () => {
      const [accounts, feeProfiles] = await Promise.all([
        window.desktop.accounts.list(includeArchived),
        window.desktop.accounts.listFeeProfiles(),
      ]);
      return { accounts, feeProfiles };
    },
  });
  return {
    accounts: query.data?.accounts ?? [],
    feeProfiles: query.data?.feeProfiles ?? [],
    isLoading: query.isLoading,
    refetch: async () => {
      await query.refetch();
    },
  };
}
