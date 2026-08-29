import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react';
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

function isFiniteNumber(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && !Number.isNaN(value);
}

function resolveInitialPrevious(cacheKey: string | undefined): number | null {
  if (!cacheKey) return null;
  const cached = readAnimatedValueCache(cacheKey);
  return cached === undefined ? null : cached;
}

function commitValue(
  cacheKey: string | undefined,
  previousRef: MutableRefObject<number | null>,
  next: number,
): void {
  previousRef.current = next;
  if (cacheKey) writeAnimatedValueCache(cacheKey, next);
}

/**
 * 数值变化时用 CountUp 滚动；Tab 切换后数值不变则静态展示（与 ValueDisplay 一致）。
 */
export function AnimatedValueDisplay({
  value,
  kind,
  cacheKey,
  durationMs = DEFAULT_DURATION_MS,
  as: Tag = 'span',
  className,
  style,
}: AnimatedValueDisplayProps): React.JSX.Element {
  const previousRef = useRef<number | null>(null);
  const isAnimatingRef = useRef(false);
  const initializedRef = useRef(false);
  const [, setRenderTick] = useState(0);

  if (!initializedRef.current) {
    initializedRef.current = true;
    previousRef.current = resolveInitialPrevious(cacheKey);
  }

  const displayProps = { kind, as: Tag, className, style, value };
  const finite = isFiniteNumber(value);
  const previous = previousRef.current;
  const isFirstReveal = finite && previous === null;
  const hasChanged =
    finite && previous !== null && Math.abs(previous - value) > VALUE_EPSILON;
  const shouldAnimate =
    finite && (isFirstReveal ? Math.abs(value) > VALUE_EPSILON : hasChanged);
  const startValue = isFirstReveal ? 0 : previous!;

  useEffect(() => {
    if (!finite) {
      previousRef.current = null;
      isAnimatingRef.current = false;
      return;
    }
    if (!shouldAnimate) {
      isAnimatingRef.current = false;
      commitValue(cacheKey, previousRef, value);
    }
  }, [cacheKey, finite, shouldAnimate, value]);

  useLayoutEffect(() => {
    isAnimatingRef.current = shouldAnimate;
  }, [shouldAnimate]);

  useEffect(() => {
    return () => {
      if (!finite || !cacheKey || isAnimatingRef.current) return;
      writeAnimatedValueCache(cacheKey, value);
    };
  }, [cacheKey, finite, value]);

  if (!finite || !shouldAnimate) {
    return <ValueDisplay {...displayProps} />;
  }

  const classNames = buildValueDisplayClassName(value, kind, className);

  return (
    <CountUp
      key={`${cacheKey ?? kind}:${startValue}->${value}`}
      start={startValue}
      end={value}
      duration={durationMs / 1000}
      decimalPlaces={animationDecimalPlacesForPreset(kind)}
      useGrouping={false}
      formattingFn={(current) => formatWithPreset(current, kind)}
      onEnd={() => {
        isAnimatingRef.current = false;
        commitValue(cacheKey, previousRef, value);
        setRenderTick((tick) => tick + 1);
      }}
    >
      {({ countUpRef }) => (
        <Tag ref={countUpRef as never} className={classNames || undefined} style={style} />
      )}
    </CountUp>
  );
}
