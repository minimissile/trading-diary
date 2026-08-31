import { useEffect } from 'react';
import { invalidateWorkspaceData } from './invalidate';

/** 订阅主进程 workspace 变更，自动失效 React Query 缓存。 */
export function QueryWorkspaceSync(): null {
  useEffect(() => {
    const invalidate = (): void => {
      void invalidateWorkspaceData();
    };
    window.addEventListener('workspace-changed', invalidate);
    const unsubscribe = window.desktop.workspace.onChanged(invalidate);
    return () => {
      window.removeEventListener('workspace-changed', invalidate);
      unsubscribe();
    };
  }, []);
  return null;
}
