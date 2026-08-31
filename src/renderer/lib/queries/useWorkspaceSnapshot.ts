import { useQuery } from '@tanstack/react-query';
import type { WorkspaceSnapshot } from '../../../shared/api.types';
import { queryKeys } from './keys';

export function useWorkspaceSnapshot(): {
  snapshot: WorkspaceSnapshot | undefined;
  isLoading: boolean;
  triggeredAlertCount: number;
} {
  const query = useQuery({
    queryKey: queryKeys.workspace.snapshot(),
    queryFn: () => window.desktop.workspace.snapshot(),
  });
  return {
    snapshot: query.data,
    isLoading: query.isLoading,
    triggeredAlertCount: query.data?.triggeredAlertCount ?? 0,
  };
}
