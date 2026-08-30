import { describe, expect, it } from 'vitest';
import { getQuotesMulti } from '../src/service/market/market-router';

describe('getQuotesMulti OTC funds', () => {
  it('fetches otc fund quotes when venue is OTC even if symbol looks like SZ stock code', async () => {
    const quotes = await getQuotesMulti([{ symbol: '004598', venue: 'OTC' }]);
    expect(quotes).toHaveLength(1);
    expect(quotes[0]?.venue).toBe('OTC');
    expect(quotes[0]?.kind).toBe('otc_fund');
    expect(quotes[0]?.name).toContain('联接');
    expect(quotes[0]?.nav ?? quotes[0]?.price).not.toBeNull();
  }, 30_000);
});
