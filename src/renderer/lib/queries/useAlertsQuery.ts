import { useQuery } from '@tanstack/react-query';
import type { TradeAlert } from '../../../shared/api.types';
import type { AlertEvent } from '../../../shared/alerts/event-types';
import { queryKeys } from './keys';

export interface AlertsDashboardData {
  alerts: TradeAlert[];
  events: AlertEvent[];
}

export function useAlertsDashboardQuery(): {
  alerts: TradeAlert[];
  events: AlertEvent[];
  isLoading: boolean;
  refetch: () => Promise<void>;
} {
  const query = useQuery({
    queryKey: queryKeys.alerts.dashboard(),
    queryFn: async () => {
      const [alerts, events] = await Promise.all([
        window.desktop.alerts.list(),
        window.desktop.alerts.listEvents(100),
      ]);
      return { alerts, events };
    },
  });
  return {
    alerts: query.data?.alerts ?? [],
    events: query.data?.events ?? [],
    isLoading: query.isLoading,
    refetch: async () => {
      await query.refetch();
    },
  };
}
