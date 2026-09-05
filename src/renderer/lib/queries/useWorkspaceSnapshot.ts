import { useQuery } from '@tanstack/react-query';
import type { WorkspaceSnapshot } from '../../../shared/api.types';
import { queryKeys } from './keys';

export function useWorkspaceSnapshot(): {
  snapshot: WorkspaceSnapshot | undefined;
  isLoading: boolean;
  triggeredAlertCount: number;
  isError: boolean;
  refetch: () => Promise<unknown>;
} {
  const query = useQuery({
    queryKey: queryKeys.workspace.snapshot(),
    queryFn: () => window.desktop.workspace.snapshot(),
  });
  return {
    snapshot: query.data,
    isError: query.isError,
    refetch: query.refetch,
    isLoading: query.isLoading,
    triggeredAlertCount: query.data?.triggeredAlertCount ?? 0,
  };
}
