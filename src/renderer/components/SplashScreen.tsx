import type { PropsWithChildren } from 'react';
import { useEffect, useRef, useState } from 'react';
import { APP_NAME, APP_SLOGAN } from '../../shared/brand';

type SplashPhase = 'enter' | 'hold' | 'exit' | 'done';

interface SloganSegment {
  text: string;
  highlight?: boolean;
}

const SLOGAN_LINES: readonly (readonly SloganSegment[])[] = [
  [
    { text: '在交易中' },
    { text: '成长', highlight: true },
  ],
  [
    { text: '每一笔成交', highlight: true },
    { text: '，都值得' },
    { text: '记录', highlight: true },
  ],
];

const TIMING = {
  enterMs: 420,
  holdMs: 2200,
  exitMs: 520,
} as const;

const REDUCED_MOTION_TIMING = {
  enterMs: 0,
  holdMs: 900,
  exitMs: 240,
} as const;

const FAILSAFE_MS = 4500;

let splashRunId = 0;

function AnimatedSloganLine({
  lineIndex,
  segments,
  reducedMotion,
}: {
  lineIndex: number;
  segments: readonly SloganSegment[];
  reducedMotion: boolean;
}): React.JSX.Element {
  let charOffset = lineIndex === 0 ? 6 : 14;

  return (
    <p className="splash-slogan-line">
      {segments.map((segment, segmentIndex) => (
        <span
          key={`${lineIndex}-${segmentIndex}`}
          className={segment.highlight ? 'splash-slogan-highlight' : undefined}
        >
          {[...segment.text].map((char, charIndex) => {
            const delay = reducedMotion ? 0 : (charOffset + charIndex) * 42;
            charOffset += 1;
            return (
              <span
                key={`${lineIndex}-${segmentIndex}-${charIndex}`}
                className="splash-char"
                style={{ animationDelay: `${delay}ms` }}
                aria-hidden={char !== ' '}
              >
                {char}
              </span>
            );
          })}
        </span>
      ))}
    </p>
  );
}

interface SplashScreenProps extends PropsWithChildren {
  onFinished?: () => void;
}

export function SplashScreen({ children, onFinished }: SplashScreenProps): React.JSX.Element {
  const [phase, setPhase] = useState<SplashPhase>('enter');
  const [reducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const finishedRef = useRef(false);
  const showOverlay = phase !== 'done';

  const markFinished = (): void => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinished?.();
  };

  useEffect(() => {
    const runId = ++splashRunId;
    const timing = reducedMotion ? REDUCED_MOTION_TIMING : TIMING;
    const timers: number[] = [];

    const schedule = (callback: () => void, delay: number): void => {
      timers.push(window.setTimeout(callback, delay));
    };

    schedule(() => {
      if (splashRunId !== runId) return;
      setPhase('hold');
    }, timing.enterMs);

    schedule(() => {
      if (splashRunId !== runId) return;
      setPhase('exit');
    }, timing.enterMs + timing.holdMs);

    schedule(() => {
      if (splashRunId !== runId) return;
      setPhase('done');
      markFinished();
    }, timing.enterMs + timing.holdMs + timing.exitMs);

    schedule(() => {
      if (splashRunId !== runId) return;
      setPhase('done');
      markFinished();
    }, FAILSAFE_MS);

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [onFinished, reducedMotion]);

  return (
    <>
      <div className="splash-app-root">{children}</div>

      {showOverlay ? (
        <div
          className={`splash-screen splash-screen--${phase}`}
          role="presentation"
          aria-hidden="true"
        >
          <div className="splash-screen__backdrop" />
          <div className="splash-screen__grid" />

          <div className="splash-screen__content">
            <div className="splash-logo-wrap">
              <span className="splash-logo-ring" />
              <img className="splash-logo" src="./logo.png" alt="" draggable={false} />
            </div>

            <p className="splash-product-name">{APP_NAME}</p>

            <div className="splash-slogan" aria-label={APP_SLOGAN.full}>
              {SLOGAN_LINES.map((segments, lineIndex) => (
                <AnimatedSloganLine
                  key={lineIndex}
                  lineIndex={lineIndex}
                  segments={segments}
                  reducedMotion={reducedMotion}
                />
              ))}
            </div>

            <div className="splash-timeline" aria-hidden="true">
              <span className="splash-timeline-track" />
              <span className="splash-timeline-tick splash-timeline-tick--a" />
              <span className="splash-timeline-tick splash-timeline-tick--b" />
              <span className="splash-timeline-dot" />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
