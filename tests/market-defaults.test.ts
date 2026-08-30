import { describe, expect, it } from 'vitest';
import {
  defaultMarketSettingsForAccount,
  resolveAccountMarketSettings,
  suggestCurrencyForMarketScope,
} from '../src/shared/accounts/market-defaults';

describe('market-defaults', () => {
  it('defaults futu to HK+US with HKD', () => {
    expect(defaultMarketSettingsForAccount('futu', 'securities')).toEqual({
      marketScope: ['HK', 'US'],
      currency: 'HKD',
    });
  });

  it('defaults zabank to HK+US with HKD', () => {
    expect(defaultMarketSettingsForAccount('zabank', 'securities')).toEqual({
      marketScope: ['HK', 'US'],
      currency: 'HKD',
    });
  });

  it('defaults domestic broker to CN_A with CNY', () => {
    expect(defaultMarketSettingsForAccount('huatai', 'securities')).toEqual({
      marketScope: ['CN_A'],
      currency: 'CNY',
    });
  });

  it('suggests USD for US-only scope', () => {
    expect(suggestCurrencyForMarketScope(['US'])).toBe('USD');
  });

  it('merges explicit currency override', () => {
    expect(
      resolveAccountMarketSettings({
        broker: 'futu',
        accountKind: 'securities',
        currency: 'USD',
      }),
    ).toEqual({
      marketScope: ['HK', 'US'],
      currency: 'USD',
    });
  });
});
