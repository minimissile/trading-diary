/** 标的上市地 / 交易场所。 */
export type InstrumentVenue = 'SH' | 'SZ' | 'HK' | 'US' | 'OTC';

/** 账户可交易市场范围。 */
export type AccountMarketScope = 'CN_A' | 'HK' | 'US';

/** 报价与结算常用 ISO 4217 币种。 */
export type QuoteCurrency = 'CNY' | 'HKD' | 'USD';

export const ACCOUNT_MARKET_SCOPES: readonly AccountMarketScope[] = ['CN_A', 'HK', 'US'] as const;

export const INSTRUMENT_VENUES: readonly InstrumentVenue[] = ['SH', 'SZ', 'HK', 'US', 'OTC'] as const;

export const QUOTE_CURRENCIES: readonly QuoteCurrency[] = ['CNY', 'HKD', 'USD'] as const;

const VENUE_QUOTE_CURRENCY: Record<InstrumentVenue, QuoteCurrency> = {
  SH: 'CNY',
  SZ: 'CNY',
  OTC: 'CNY',
  HK: 'HKD',
  US: 'USD',
};

const VENUE_SCOPE: Record<InstrumentVenue, AccountMarketScope> = {
  SH: 'CN_A',
  SZ: 'CN_A',
  OTC: 'CN_A',
  HK: 'HK',
  US: 'US',
};

const SCOPE_LABELS: Record<AccountMarketScope, string> = {
  CN_A: 'A 股',
  HK: '港股',
  US: '美股',
};

const VENUE_LABELS: Record<InstrumentVenue, string> = {
  SH: '沪',
  SZ: '深',
  HK: '港',
  US: '美',
  OTC: '场外',
};

const CURRENCY_SYMBOLS: Record<QuoteCurrency, string> = {
  CNY: '¥',
  HKD: 'HK$',
  USD: '$',
};

/** 上市地对应的报价币种。 */
export function quoteCurrencyForVenue(venue: InstrumentVenue): QuoteCurrency {
  return VENUE_QUOTE_CURRENCY[venue];
}

/** 上市地映射到账户 marketScope。 */
export function marketScopeForVenue(venue: InstrumentVenue): AccountMarketScope {
  return VENUE_SCOPE[venue];
}

/** 判断账户 scope 是否允许该 venue。 */
export function isVenueAllowedByScopes(scopes: readonly string[], venue: InstrumentVenue): boolean {
  const required = marketScopeForVenue(venue);
  return scopes.includes(required);
}

/** 账户 scope 的人类可读标签。 */
export function labelForMarketScope(scope: AccountMarketScope): string {
  return SCOPE_LABELS[scope];
}

/** 上市地短标签。 */
export function labelForVenue(venue: InstrumentVenue): string {
  return VENUE_LABELS[venue];
}

/** 展示用货币符号。 */
export function currencySymbolFor(currency: string): string {
  if (currency === 'CNY') return CURRENCY_SYMBOLS.CNY;
  if (currency === 'HKD') return CURRENCY_SYMBOLS.HKD;
  if (currency === 'USD') return CURRENCY_SYMBOLS.USD;
  return currency;
}

/** 规范化 marketScope 数组：去重、过滤非法值、排序。 */
export function normalizeMarketScope(values: readonly string[] | undefined): AccountMarketScope[] {
  if (!values || values.length === 0) return ['CN_A'];
  const seen = new Set<AccountMarketScope>();
  for (const value of values) {
    if (value === 'CN_A' || value === 'HK' || value === 'US') {
      seen.add(value);
    }
  }
  if (seen.size === 0) return ['CN_A'];
  const order: AccountMarketScope[] = ['CN_A', 'HK', 'US'];
  return order.filter((item) => seen.has(item));
}

/** 校验 marketScope 是否合法。 */
export function assertValidMarketScope(values: readonly string[]): AccountMarketScope[] {
  const normalized = normalizeMarketScope(values);
  if (normalized.length === 0) {
    throw new Error('至少选择一个可交易市场');
  }
  return normalized;
}
