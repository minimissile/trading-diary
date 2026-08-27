import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import type { Execution } from '../../../shared/api.types';
import { formatCurrency, formatDateTime, formatPrice } from '../../lib/trading-format';

interface EpisodeTimelineProps {
  executions: Execution[];
}

/**
 * 展示交易回合内的分批成交流水。
 */
export function EpisodeTimeline({ executions }: EpisodeTimelineProps): React.JSX.Element {
  if (executions.length === 0) {
    return <p className="episode-timeline-empty">暂无成交记录</p>;
  }

  return (
    <ol className="episode-timeline">
      {executions.map((execution) => (
        <li className={`episode-timeline-item episode-timeline-item--${execution.side}`} key={execution.id}>
          <span className="episode-timeline-icon" aria-hidden="true">
            {execution.side === 'buy' ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
          </span>
          <div className="episode-timeline-body">
            <strong>{execution.side === 'buy' ? '买入' : '卖出'}</strong>
            <span>
              {execution.quantity} @ {formatPrice(execution.price)}
            </span>
            <small>
              费用 {formatCurrency(execution.fees)} · {formatDateTime(execution.tradeAt)}
            </small>
            {execution.note ? <small>{execution.note}</small> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
