import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  FundSipOccurrenceView,
  FundSipPlanDetailView,
  FundSipPlanView,
  SipOccurrenceCalendarDay,
  SipPlanStatus,
} from '../../../shared/sip/types';
import { queryKeys } from './keys';

export interface SipDashboardData {
  plans: FundSipPlanView[];
  summary: SipSummaryView;
  dueOccurrences: FundSipOccurrenceView[];
  historyOccurrences: FundSipOccurrenceView[];
  calendarDays: SipOccurrenceCalendarDay[];
}

async function fetchSipDashboard(month: string): Promise<SipDashboardData> {
  await window.desktop.sip.scanDue();
  const [plans, summary, workspace, historyOccurrences, calendarDays] = await Promise.all([
    window.desktop.sip.listPlans(),
    window.desktop.sip.getSummary(),
    window.desktop.workspace.snapshot(),
    window.desktop.sip.listOccurrenceViews(),
    window.desktop.sip.getOccurrenceCalendar(month),
  ]);
  return {
    plans,
    summary,
    dueOccurrences: workspace.dueSipOccurrences,
    historyOccurrences,
    calendarDays,
  };
}

export function useSipDashboardQuery(month: string): {
  data: SipDashboardData | undefined;
  isLoading: boolean;
  refetch: () => Promise<void>;
} {
  const query = useQuery({
    queryKey: queryKeys.sip.dashboard(month),
    queryFn: () => fetchSipDashboard(month),
  });
  return {
    data: query.data,
    isLoading: query.isLoading,
    refetch: async () => {
      await query.refetch();
    },
  };
}

export function useSipPlanQuery(planId: string | null): {
  plan: FundSipPlanDetailView | undefined;
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: queryKeys.sip.plan(planId ?? ''),
    queryFn: () => window.desktop.sip.getPlan(planId!),
    enabled: Boolean(planId),
  });
  return { plan: query.data, isLoading: query.isLoading };
}

export function useSipOccurrenceCalendarQuery(month: string): {
  calendarDays: SipOccurrenceCalendarDay[];
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: queryKeys.sip.occurrenceCalendar(month),
    queryFn: () => window.desktop.sip.getOccurrenceCalendar(month),
  });
  return { calendarDays: query.data ?? [], isLoading: query.isLoading };
}

export function usePrefetchSipPlan(): (planId: string) => Promise<FundSipPlanDetailView> {
  const client = useQueryClient();
  return (planId: string) =>
    client.fetchQuery({
      queryKey: queryKeys.sip.plan(planId),
      queryFn: () => window.desktop.sip.getPlan(planId),
    });
}
