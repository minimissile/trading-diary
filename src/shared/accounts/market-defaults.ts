import type { AccountBroker, AccountKind } from './types';
import type { AccountMarketScope, QuoteCurrency } from '../market/venues';
import { normalizeMarketScope } from '../market/venues';

export interface AccountMarketDefaults {
  marketScope: AccountMarketScope[];
  currency: QuoteCurrency;
}

const HK_US_BROKERS: readonly AccountBroker[] = ['futu', 'tiger', 'zabank'] as const;

/** 按券商与账户类型推断默认 marketScope 与结算币种。 */
export function defaultMarketSettingsForAccount(
  broker: AccountBroker,
  accountKind: AccountKind,
): AccountMarketDefaults {
  if (accountKind === 'fund') {
    return { marketScope: ['CN_A'], currency: 'CNY' };
  }
  if (HK_US_BROKERS.includes(broker)) {
    return { marketScope: ['HK', 'US'], currency: 'HKD' };
  }
  return { marketScope: ['CN_A'], currency: 'CNY' };
}

/** 合并用户输入与默认值。 */
export function resolveAccountMarketSettings(input: {
  broker?: AccountBroker;
  accountKind?: AccountKind;
  marketScope?: readonly string[];
  currency?: string;
}): AccountMarketDefaults {
  const broker = input.broker ?? 'custom';
  const accountKind = input.accountKind ?? 'securities';
  const defaults = defaultMarketSettingsForAccount(broker, accountKind);

  const marketScope = input.marketScope ? normalizeMarketScope(input.marketScope) : defaults.marketScope;

  let currency = defaults.currency;
  if (input.currency === 'CNY' || input.currency === 'HKD' || input.currency === 'USD') {
    currency = input.currency;
  }

  if (marketScope.includes('US') && marketScope.includes('HK') && !marketScope.includes('CN_A')) {
    if (!input.currency) currency = 'HKD';
  } else if (marketScope.includes('US') && !marketScope.includes('CN_A') && !marketScope.includes('HK')) {
    if (!input.currency) currency = 'USD';
  } else if (marketScope.includes('CN_A') && marketScope.length === 1) {
    if (!input.currency) currency = 'CNY';
  }

  return { marketScope, currency };
}

/** 账户 scope 变更时建议的结算币种。 */
export function suggestCurrencyForMarketScope(scopes: readonly AccountMarketScope[]): QuoteCurrency {
  if (scopes.includes('CN_A') && scopes.length === 1) return 'CNY';
  if (scopes.includes('US') && !scopes.includes('HK') && !scopes.includes('CN_A')) return 'USD';
  if (scopes.includes('HK')) return 'HKD';
  if (scopes.includes('US')) return 'USD';
  return 'CNY';
}
