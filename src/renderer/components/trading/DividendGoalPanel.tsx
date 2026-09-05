import { Button, Tag } from 'antd';
import { AimOutlined, EditOutlined } from '@ant-design/icons';
import type { DividendGoalProgressView } from '../../../shared/portfolio/dividend-goal';
import { AnimatedValueDisplay, ValueDisplay } from '../../lib/trading-format';

interface DividendGoalPanelProps {
  progressList: DividendGoalProgressView[];
  allAccountsView: boolean;
  year: number;
  animationKey: string;
  onEdit: () => void;
}

function GoalProgressItem({
  progress,
  animationKey,
}: {
  progress: DividendGoalProgressView;
  animationKey: string;
}): React.JSX.Element {
  const barWidth = progress.reached ? 100 : Math.min(progress.progressPercent, 100);

  return (
    <article className={`portfolio-dividend-goal-item${progress.reached ? ' portfolio-dividend-goal-item--reached' : ''}`}>
      <div className="portfolio-dividend-goal-item-head">
        <strong>{progress.kindLabel}</strong>
        <span className="dividend-goal-status">
          {progress.reached ? <Tag color="success">已达成</Tag> : null}
          <AnimatedValueDisplay
            as="strong"
            kind="progressPercent"
            value={progress.progressPercent}
            cacheKey={`${animationKey}:${progress.kind}:percent`}
          />
        </span>
      </div>
      <div className="portfolio-dividend-goal-values">
        <span>
          当前{' '}
          <AnimatedValueDisplay
            kind="currency"
            value={progress.currentAmount}
            cacheKey={`${animationKey}:${progress.kind}:current`}
          />
        </span>
        <span>
          目标 <ValueDisplay kind="currency" value={progress.targetAmount} />
        </span>
      </div>
      <div
        className="portfolio-dividend-goal-bar"
        role="progressbar"
        aria-label={progress.kindLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.max(0, barWidth)}
        aria-valuetext={`已完成 ${progress.progressPercent.toFixed(2)}%`}
      >
        <i className="dividend-progress-fill" style={{ width: `${barWidth}%` }} />
      </div>
      <p className="portfolio-dividend-goal-caption">
        {progress.reached ? (
          <>
            已超出目标{' '}
            <AnimatedValueDisplay
              kind="currency"
              value={Math.max(progress.currentAmount - progress.targetAmount, 0)}
              cacheKey={`${animationKey}:${progress.kind}:excess`}
            />
          </>
        ) : (
          <>
            还差{' '}
            <AnimatedValueDisplay
              kind="currency"
              value={progress.remaining}
              cacheKey={`${animationKey}:${progress.kind}:remaining`}
            />{' '}
            达成目标
          </>
        )}
      </p>
    </article>
  );
}

/**
 * 展示分红目标进度，支持同时显示累计与日均两个目标。
 */
export function DividendGoalPanel({
  progressList,
  allAccountsView,
  year,
  animationKey,
  onEdit,
}: DividendGoalPanelProps): React.JSX.Element {
  if (progressList.length === 0) {
    return (
      <section className="portfolio-dividend-goal portfolio-dividend-goal--empty">
        <div className="portfolio-dividend-goal-head">
          <div className="portfolio-dividend-goal-head-copy">
            <h2>分红目标</h2>
            <p>可同时设定今年累计与日均分红目标，分别跟踪完成进度</p>
          </div>
          <Button type="primary" icon={<AimOutlined />} onClick={onEdit}>
            设置目标
          </Button>
        </div>
      </section>
    );
  }

  const allReached = progressList.every((item) => item.reached);

  return (
    <section className={`portfolio-dividend-goal${allReached ? ' portfolio-dividend-goal--reached' : ''}`}>
      <div className="portfolio-dividend-goal-head">
        <div className="portfolio-dividend-goal-head-copy">
          <h2>分红目标</h2>
          <p>
            {allAccountsView ? '全部账户汇总 · ' : ''}
            {year} · 已设置 {progressList.length} 个目标
          </p>
        </div>
        <Button icon={<EditOutlined />} onClick={onEdit}>
          调整目标
        </Button>
      </div>

      <div className="portfolio-dividend-goal-items" data-goal-count={progressList.length}>
        {progressList.map((progress) => (
          <GoalProgressItem key={`${animationKey}:${progress.kind}`} progress={progress} animationKey={animationKey} />
        ))}
      </div>
    </section>
  );
}
