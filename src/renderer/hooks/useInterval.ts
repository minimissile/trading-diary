import { useEffect, useRef } from 'react';

/**
 * 以固定间隔执行回调；传入 null 时暂停。
 */
export function useInterval(callback: () => void, delayMs: number | null): void {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delayMs === null) return undefined;
    const timerId = window.setInterval(() => savedCallback.current(), delayMs);
    return () => window.clearInterval(timerId);
  }, [delayMs]);
}
