import { ArrowRightOutlined, CheckOutlined, TrophyOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import type { MilestoneState } from '../../../shared/portfolio/types';
import { AnimatedValueDisplay, ValueDisplay } from '../../lib/trading-format';

interface DividendMilestoneWallProps {
  milestones: MilestoneState[];
  received: number;
  animationKey: string;
}

export function DividendMilestoneWall({ milestones, received, animationKey }: DividendMilestoneWallProps): React.JSX.Element {
  const nextMilestone = milestones.find((item) => !item.lit);
  const litCount = milestones.filter((item) => item.lit).length;

  return (
    <section className="dividend-milestones" aria-labelledby="dividend-milestones-title">
      <div className="dividend-section-heading">
        <div>
          <h2 id="dividend-milestones-title">分红点亮墙</h2>
          <p>让每一笔已确认分红，成为看得见的生活收获</p>
        </div>
        <span className="dividend-milestone-count">
          <CheckOutlined aria-hidden="true" /> 已点亮 <b>{litCount}</b> / {milestones.length}
        </span>
      </div>

      {nextMilestone ? (
        <div className="dividend-next-milestone">
          <span>
            <ArrowRightOutlined aria-hidden="true" /> 下一站 <strong>{nextMilestone.name}</strong>
          </span>
          <span>
            再积累{' '}
            <AnimatedValueDisplay
              kind="currency"
              value={Math.max(nextMilestone.threshold - received, 0)}
              cacheKey={`${animationKey}:milestone:${nextMilestone.id}:remaining`}
            />{' '}
            即可点亮
          </span>
        </div>
      ) : milestones.length > 0 ? (
        <div className="dividend-next-milestone dividend-next-milestone--complete">
          <TrophyOutlined aria-hidden="true" /> 全部里程碑已点亮，每一笔积累都值得记录。
        </div>
      ) : null}

      <div className="dividend-milestone-grid">
        {milestones.map((milestone) => {
          const isNext = milestone.id === nextMilestone?.id;
          const state = milestone.lit ? '已点亮' : isNext ? '下一站' : '未点亮';
          return (
            <Tooltip classNames={{ root: 'dividend-tooltip' }} key={milestone.id} title={`${state} · ${milestone.caption}`}>
              <article
                className={`dividend-milestone${milestone.lit ? ' is-lit' : ''}${isNext ? ' is-next' : ''}`}
                tabIndex={0}
                aria-label={`${milestone.name}，${milestone.threshold} 元，${state}`}
              >
                <span className="dividend-milestone-emoji" aria-hidden="true">
                  {milestone.emoji}
                </span>
                {milestone.lit ? <CheckOutlined className="dividend-milestone-check" aria-hidden="true" /> : null}
                <strong>{milestone.name}</strong>
                <ValueDisplay as="small" kind="currency" value={milestone.threshold} />
                {!milestone.lit ? (
                  <div
                    className="dividend-milestone-progress"
                    role="progressbar"
                    aria-label={`${milestone.name}进度`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(milestone.progress * 100)}
                  >
                    <i className="dividend-progress-fill" style={{ width: `${milestone.progress * 100}%` }} />
                  </div>
                ) : null}
                {isNext ? <span className="dividend-milestone-next-label">下一站</span> : null}
              </article>
            </Tooltip>
          );
        })}
      </div>
    </section>
  );
}
