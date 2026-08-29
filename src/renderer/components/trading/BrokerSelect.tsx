import { Select } from 'antd';
import type { AccountBroker } from '../../../shared/accounts/types';
import {
  BROKER_GROUP_LABELS,
  BROKER_REGISTRY,
  getBrokerLabel,
  matchBrokerSearch,
} from '../../../shared/accounts/brokers';
import { BrokerAvatar } from './BrokerAvatar';

interface BrokerSelectProps {
  value?: AccountBroker;
  onChange?: (broker: AccountBroker) => void;
  className?: string;
}

function BrokerOptionLabel({ brokerId, showName = true }: { brokerId: AccountBroker; showName?: boolean }): React.JSX.Element {
  return (
    <span className="broker-select-option">
      <BrokerAvatar brokerId={brokerId} className="broker-select-icon" size={18} />
      {showName ? <span>{getBrokerLabel(brokerId)}</span> : null}
    </span>
  );
}

/** 带图标与分组的券商选择器。 */
export function BrokerSelect({ value, onChange, className }: BrokerSelectProps): React.JSX.Element {
  const options = BROKER_REGISTRY.map((item) => ({
    value: item.id,
    label: item.label,
    group: BROKER_GROUP_LABELS[item.group],
  }));

  return (
    <Select<AccountBroker>
      className={className ? `broker-select ${className}` : 'broker-select'}
      showSearch
      classNames={{ popup: { root: 'trading-select-dropdown' } }}
      getPopupContainer={(trigger) => trigger.ownerDocument.body}
      filterOption={(input, option) => {
        const meta = BROKER_REGISTRY.find((item) => item.id === option?.value);
        return meta ? matchBrokerSearch(meta, input) : false;
      }}
      placeholder="选择券商或渠道"
      value={value}
      onChange={onChange}
      options={options}
      optionRender={(option) => <BrokerOptionLabel brokerId={option.value as AccountBroker} />}
      labelRender={(option) => (
        <BrokerOptionLabel brokerId={(option.value ?? value ?? 'other') as AccountBroker} />
      )}
    />
  );
}
