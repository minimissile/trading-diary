import { useEffect, useMemo, useState } from 'react';
import type { AccountBroker } from '../../../shared/api.types';
import { getBrokerIconCandidates, getBrokerLabel } from '../../../shared/accounts/brokers';

interface BrokerAvatarProps {
  brokerId: AccountBroker;
  className?: string;
  size?: number;
}

/** 券商图标；多源加载，全部失败后显示首字占位。 */
export function BrokerAvatar({ brokerId, className, size = 32 }: BrokerAvatarProps): React.JSX.Element {
  const candidates = useMemo(() => getBrokerIconCandidates(brokerId, size), [brokerId, size]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const label = getBrokerLabel(brokerId);
  const baseClass = className ?? 'broker-avatar';

  useEffect(() => {
    setCandidateIndex(0);
  }, [brokerId, candidates]);

  const iconUrl = candidates[candidateIndex];
  const showFallback = !iconUrl || candidateIndex >= candidates.length;

  if (showFallback) {
    return (
      <span
        className={`${baseClass} ${baseClass}--fallback`}
        style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.42)) }}
        aria-hidden="true"
      >
        {label.slice(0, 1)}
      </span>
    );
  }

  return (
    <img
      className={baseClass}
      src={iconUrl}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setCandidateIndex((current) => current + 1)}
    />
  );
}
