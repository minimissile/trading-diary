import { getBrokerLabel } from './brokers';
import type { AccountBroker } from './types';

/** 解析写入数据库的账户名称：有别名用别名，否则用券商名。 */
export function resolveAccountName(broker: AccountBroker, alias?: string): string {
  const trimmed = alias?.trim();
  if (trimmed) return trimmed;
  return getBrokerLabel(broker);
}

/** 用户自定义别名；与券商默认名相同时视为未设置。 */
export function getAccountAlias(account: { name: string; broker: AccountBroker }): string | null {
  const trimmed = account.name.trim();
  if (!trimmed) return null;
  return trimmed === getBrokerLabel(account.broker) ? null : trimmed;
}

/** 下拉与列表中的账户展示文案。 */
export function formatAccountSelectLabel(account: {
  name: string;
  broker: AccountBroker;
  isDefault: boolean;
}): string {
  const brokerLabel = getBrokerLabel(account.broker);
  const alias = getAccountAlias(account);
  const base = alias ? `${brokerLabel} · ${alias}` : brokerLabel;
  return account.isDefault ? `${base}（默认）` : base;
}
