import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useCountUp } from 'react-countup';
import type { CSSProperties, ElementType } from 'react';
import type { DisplayPresetKind } from '../../../shared/format/display-presets';
import { animationDecimalPlacesForPreset, formatWithPreset } from '../../../shared/format/display-presets';
import { readAnimatedValueCache, writeAnimatedValueCache } from '../../lib/animated-value-cache';
import { buildValueDisplayClassName } from './ValueDisplay';

export interface AnimatedValueDisplayProps {
  value: number | null | undefined;
  kind: DisplayPresetKind;
  /** 跨挂载标识；切换 Tab 后复用上次数值，避免重复从 0 动画。 */
  cacheKey?: string;
  /** 过渡时长（毫秒），默认首次 800、后续更新 300。 */
  durationMs?: number;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_DURATION_MS = 800;
const UPDATE_DURATION_MS = 300;

function easeOutCubic(time: number, start: number, change: number, duration: number): number {
  return start + change * (1 - (1 - time / duration) ** 3);
}

function subscribeReducedMotion(onChange: () => void): () => void {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function AnimatedValueSession({
  value,
  kind,
  cacheKey,
  durationMs,
  as: Tag = 'span',
  className,
  style,
  reducedMotion,
}: AnimatedValueDisplayProps & { reducedMotion: boolean }): React.JSX.Element {
  const elementRef = useRef<HTMLElement>(null);
  const [initialValue] = useState(() => (cacheKey ? (readAnimatedValueCache(cacheKey) ?? 0) : 0));
  const lastTarget = useRef<number | null>(null);
  const lastMotion = useRef(reducedMotion);
  const formatValue = useCallback((current: number) => formatWithPreset(current, kind), [kind]);
  const { getCountUp, update, reset } = useCountUp({
    ref: elementRef as React.RefObject<HTMLElement>,
    start: initialValue,
    end: initialValue,
    startOnMount: false,
    enableReinitialize: false,
    decimals: animationDecimalPlacesForPreset(kind),
    useGrouping: false,
    formattingFn: formatValue,
    easingFn: easeOutCubic,
    smartEasingThreshold: Number.POSITIVE_INFINITY,
  });

  useEffect(() => {
    const instance = getCountUp();
    const motionChanged = lastMotion.current !== reducedMotion;
    lastMotion.current = reducedMotion;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      reset();
      lastTarget.current = null;
      if (elementRef.current) elementRef.current.textContent = formatWithPreset(null, kind);
      return;
    }

    const previousTarget = lastTarget.current;
    lastTarget.current = value;
    // Cache the latest real value so remounting during an animation does not replay it.
    if (cacheKey) writeAnimatedValueCache(cacheKey, value);
    if (!motionChanged && previousTarget !== null && formatValue(previousTarget) === formatValue(value)) return;

    const duration = durationMs ?? (previousTarget === null ? DEFAULT_DURATION_MS : UPDATE_DURATION_MS);
    const instant = reducedMotion || duration <= 0 || formatValue(instance.frameVal) === formatValue(value);
    if (instant) {
      // Reset cancels the pending frame; render the exact target without another animation.
      if (instance.options) instance.options.startVal = value;
      reset();
      return;
    }
    if (instance.options) instance.options.duration = duration / 1000;
    // CountUp.update starts from frameVal, including when the prior animation is unfinished.
    update(value);
  }, [cacheKey, durationMs, formatValue, getCountUp, kind, reducedMotion, reset, update, value]);

  useEffect(() => () => {
    lastTarget.current = null;
  }, []);

  // The animation owns the text node; React only updates the surrounding presentation.
  return (
    <Tag
      ref={elementRef as never}
      className={buildValueDisplayClassName(value, kind, className) || undefined}
      style={style}
    />
  );
}

/** 首次显示从 0 过渡，更新时从当前显示数值接续过渡；尊重系统的减少动态效果设置。 */
export function AnimatedValueDisplay(props: AnimatedValueDisplayProps): React.JSX.Element {
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);
  return (
    <AnimatedValueSession key={`${props.cacheKey ?? props.kind}:${props.kind}:${typeof props.as === 'string' ? props.as : 'span'}`} {...props} reducedMotion={reducedMotion} />
  );
}
