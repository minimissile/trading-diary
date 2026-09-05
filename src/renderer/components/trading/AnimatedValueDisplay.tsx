import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import CountUp from 'react-countup';
import type { CSSProperties, ElementType } from 'react';
import type { DisplayPresetKind } from '../../../shared/format/display-presets';
import { animationDecimalPlacesForPreset, formatWithPreset } from '../../../shared/format/display-presets';
import { readAnimatedValueCache, writeAnimatedValueCache } from '../../lib/animated-value-cache';
import { buildValueDisplayClassName, ValueDisplay } from './ValueDisplay';

export interface AnimatedValueDisplayProps {
  value: number | null | undefined;
  kind: DisplayPresetKind;
  /** 跨挂载标识；切换 Tab 后复用上次数值，避免重复从 0 动画。 */
  cacheKey?: string;
  /** 过渡时长（毫秒），默认 800。 */
  durationMs?: number;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_DURATION_MS = 800;
const VALUE_EPSILON = 1e-9;

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
  durationMs = DEFAULT_DURATION_MS,
  as: Tag = 'span',
  className,
  style,
  reducedMotion,
}: AnimatedValueDisplayProps & { reducedMotion: boolean }): React.JSX.Element {
  const [previous, setPrevious] = useState<number | null>(() => (cacheKey ? (readAnimatedValueCache(cacheKey) ?? null) : null));
  const finite = typeof value === 'number' && Number.isFinite(value);
  const startValue = previous ?? 0;
  const shouldAnimate = finite && !reducedMotion && durationMs > 0 && Math.abs(startValue - value) > VALUE_EPSILON;
  const formatValue = useCallback((current: number) => formatWithPreset(current, kind), [kind]);

  useEffect(() => {
    if (finite && !shouldAnimate && cacheKey) writeAnimatedValueCache(cacheKey, value);
  }, [cacheKey, finite, shouldAnimate, value]);

  if (!finite || !shouldAnimate) {
    return <ValueDisplay kind={kind} as={Tag} className={className} style={style} value={value} />;
  }

  return (
    <CountUp
      key={`${startValue}->${value}`}
      start={startValue}
      end={value}
      delay={0}
      duration={durationMs / 1000}
      decimals={animationDecimalPlacesForPreset(kind)}
      useGrouping={false}
      formattingFn={formatValue}
      onEnd={() => {
        if (cacheKey) writeAnimatedValueCache(cacheKey, value);
        setPrevious(value);
      }}
    >
      {({ countUpRef }) => (
        <Tag
          ref={countUpRef as never}
          className={buildValueDisplayClassName(value, kind, className) || undefined}
          style={style}
        />
      )}
    </CountUp>
  );
}

/** 首次显示从 0 过渡，更新时从上次完成的数值过渡；尊重系统的减少动态效果设置。 */
export function AnimatedValueDisplay(props: AnimatedValueDisplayProps): React.JSX.Element {
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);
  return (
    <AnimatedValueSession key={`${props.cacheKey ?? props.kind}:${reducedMotion}`} {...props} reducedMotion={reducedMotion} />
  );
}
