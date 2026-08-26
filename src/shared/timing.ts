/** 防抖：停止触发后 waitMs 再执行。 */
export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  waitMs: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  };
}

/** 节流：waitMs 内最多执行一次，末尾会补一次调用。 */
export function throttle<T extends (...args: never[]) => void>(
  fn: T,
  waitMs: number,
): (...args: Parameters<T>) => void {
  let lastRun = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: Parameters<T> | null = null;

  return (...args: Parameters<T>) => {
    pendingArgs = args;
    const now = Date.now();
    const remaining = waitMs - (now - lastRun);

    const invoke = (): void => {
      if (!pendingArgs) return;
      const nextArgs = pendingArgs;
      pendingArgs = null;
      lastRun = Date.now();
      fn(...nextArgs);
    };

    if (remaining <= 0) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      invoke();
      return;
    }

    if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        invoke();
      }, remaining);
    }
  };
}
