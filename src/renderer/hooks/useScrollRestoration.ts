import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { useLocation } from 'react-router';

/** 各路由 pathname → 上次滚动位置。 */
const scrollPositions = new Map<string, number>();

function clampScrollTop(container: HTMLElement, target: number): number {
  const max = Math.max(0, container.scrollHeight - container.clientHeight);
  return Math.min(Math.max(0, target), max);
}

/**
 * 在 AppShell 的 `.app-page-scroll` 上恢复滚动位置。
 *
 * 不能用路由 effect cleanup 保存 scrollTop：切换路由时子页面先渲染，
 * 图表页还会把容器设为 overflow:hidden，cleanup 读到的已是 0。
 * 因此在 scroll 事件中持续写入；回到页面后用 ResizeObserver 等内容撑开后再对齐。
 */
export function useScrollRestoration(containerRef: RefObject<HTMLElement | null>): void {
  const { pathname } = useLocation();
  const pathnameRef = useRef(pathname);
  useLayoutEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onScroll = (): void => {
      scrollPositions.set(pathnameRef.current, container.scrollTop);
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [containerRef]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const target = scrollPositions.get(pathname) ?? 0;
    let cancelled = false;
    let restored = target === 0;
    let observer: ResizeObserver | null = null;

    const apply = (): void => {
      if (cancelled || restored) return;
      const clamped = clampScrollTop(container, target);
      if (container.scrollTop !== clamped) {
        container.scrollTop = clamped;
      }
      if (Math.abs(container.scrollTop - clamped) <= 1) {
        restored = true;
        observer?.disconnect();
        observer = null;
      }
    };

    apply();
    requestAnimationFrame(apply);

    observer = new ResizeObserver(() => apply());
    const content = container.firstElementChild;
    if (content) observer.observe(content);
    else observer.observe(container);

    const timeout = window.setTimeout(() => {
      apply();
      observer?.disconnect();
      observer = null;
    }, 2_000);

    return () => {
      cancelled = true;
      observer?.disconnect();
      window.clearTimeout(timeout);
    };
  }, [containerRef, pathname]);
}
