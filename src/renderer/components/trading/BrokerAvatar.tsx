import { useState } from 'react';
import type { AccountBroker } from '../../../shared/api.types';
import { getBrokerIconAssetUrl, getBrokerLabel } from '../../../shared/accounts/brokers';

interface BrokerAvatarProps {
  brokerId: AccountBroker;
  className?: string;
  size?: number;
}

/** 券商图标；经主进程 app-asset 缓存加载，失败后显示首字占位。 */
export function BrokerAvatar({ brokerId, className, size = 32 }: BrokerAvatarProps): React.JSX.Element {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const label = getBrokerLabel(brokerId);
  const baseClass = className ?? 'broker-avatar';
  const iconUrl = getBrokerIconAssetUrl(brokerId);

  if (!iconUrl || failedUrl === iconUrl) {
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
      onError={() => setFailedUrl(iconUrl)}
    />
  );
}
