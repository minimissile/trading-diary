import { useQuery } from '@tanstack/react-query';
import type { PlaybookRule } from '../../../shared/playbook/types';
import { queryKeys } from './keys';

export function usePlaybookQuery(): {
  rules: PlaybookRule[];
  isLoading: boolean;
  refetch: () => Promise<void>;
} {
  const query = useQuery({
    queryKey: queryKeys.playbook.list(),
    queryFn: () => window.desktop.playbook.list(),
  });
  return {
    rules: query.data ?? [],
    isLoading: query.isLoading,
    refetch: async () => {
      await query.refetch();
    },
  };
}
