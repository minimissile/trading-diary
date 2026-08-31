import { useQuery } from '@tanstack/react-query';
import type { TradeReview } from '../../../shared/api.types';
import { queryKeys } from './keys';

export function useReviewsQuery(): {
  reviews: TradeReview[];
  isLoading: boolean;
  refetch: () => Promise<void>;
} {
  const query = useQuery({
    queryKey: queryKeys.reviews.list(),
    queryFn: () => window.desktop.reviews.list(),
  });
  return {
    reviews: query.data ?? [],
    isLoading: query.isLoading,
    refetch: async () => {
      await query.refetch();
    },
  };
}
