import { useEffect, useRef } from 'react';
import { IS_RENDERER_DEV } from '../dev-mode';
import { invalidateWorkspaceData } from './invalidate';

const DEV_INVALIDATE_DEBOUNCE_MS = 400;

/** 订阅主进程 workspace 变更，自动失效 React Query 缓存。 */
export function QueryWorkspaceSync(): null {
  const debounceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const invalidate = (): void => {
      if (IS_RENDERER_DEV) {
        if (debounceTimerRef.current !== null) {
          window.clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = window.setTimeout(() => {
          debounceTimerRef.current = null;
          void invalidateWorkspaceData();
        }, DEV_INVALIDATE_DEBOUNCE_MS);
        return;
      }
      void invalidateWorkspaceData();
    };

    window.addEventListener('workspace-changed', invalidate);
    const unsubscribe = window.desktop.workspace.onChanged(invalidate);
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
      window.removeEventListener('workspace-changed', invalidate);
      unsubscribe();
    };
  }, []);

  return null;
}
