import { useQuery } from '@tanstack/react-query';
import type { TradingPlan } from '../../../shared/api.types';
import { queryKeys } from './keys';

export function usePlansQuery(): {
  plans: TradingPlan[];
  isLoading: boolean;
  refetch: () => Promise<void>;
} {
  const query = useQuery({
    queryKey: queryKeys.plans.list(),
    queryFn: () => window.desktop.plans.list(),
  });
  return {
    plans: query.data ?? [],
    isLoading: query.isLoading,
    refetch: async () => {
      await query.refetch();
    },
  };
}
