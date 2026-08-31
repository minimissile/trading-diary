import { useQuery } from '@tanstack/react-query';
import type { TradeEpisodeView } from '../../../shared/api.types';
import { queryKeys } from './keys';

export function useEpisodesQuery(accountId: string | undefined): {
  episodes: TradeEpisodeView[];
  isLoading: boolean;
  refetch: () => Promise<void>;
} {
  const query = useQuery({
    queryKey: queryKeys.episodes.list(accountId),
    queryFn: () => window.desktop.episodes.list(accountId),
    enabled: Boolean(accountId),
  });
  return {
    episodes: query.data ?? [],
    isLoading: query.isLoading,
    refetch: async () => {
      await query.refetch();
    },
  };
}
