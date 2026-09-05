import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketSearchHit } from '../src/shared/market/types';
import { searchInstrumentsMulti } from '../src/service/market/market-router';
import { searchInstrumentsScoped } from '../src/service/market/eastmoney/search-service';
import { searchYahooInstruments } from '../src/service/market/yahoo/quote-service';

vi.mock('../src/service/market/eastmoney/search-service', async importOriginal => ({
  ...await importOriginal<typeof import('../src/service/market/eastmoney/search-service')>(),
  searchInstrumentsScoped: vi.fn(),
}));
vi.mock('../src/service/market/yahoo/quote-service', async importOriginal => ({
  ...await importOriginal<typeof import('../src/service/market/yahoo/quote-service')>(),
  searchYahooInstruments: vi.fn(),
}));

const cn: MarketSearchHit = { symbol: '600227', name: '赤天化', kind: 'stock', venue: 'SH', quoteCurrency: 'CNY', securityTypeName: '沪A', source: 'eastmoney' };
const us: MarketSearchHit = { symbol: 'AAPL', name: 'Apple', kind: 'stock', venue: 'US', quoteCurrency: 'USD', securityTypeName: '美股', source: 'yahoo' };
beforeEach(() => vi.resetAllMocks());

describe('multi-market search provider failures', () => {
  it('keeps 赤天化 when Eastmoney succeeds and Yahoo returns 403', async () => {
    vi.mocked(searchInstrumentsScoped).mockResolvedValue([cn]);
    vi.mocked(searchYahooInstruments).mockRejectedValue(new Error('Yahoo HTTP 403'));
    expect(await searchInstrumentsMulti('赤天化', ['CN_A', 'HK', 'US'], 8, 'stock')).toEqual([cn]);
  });

  it('keeps offshore results when the domestic provider fails', async () => {
    vi.mocked(searchInstrumentsScoped).mockRejectedValue(new Error('Eastmoney unavailable'));
    vi.mocked(searchYahooInstruments).mockResolvedValue([us]);
    expect(await searchInstrumentsMulti('AAPL', ['CN_A', 'HK', 'US'], 8, 'stock')).toEqual([us]);
  });

  it('reports source failure rather than claiming no matches when no source returns hits', async () => {
    vi.mocked(searchInstrumentsScoped).mockResolvedValue([]);
    vi.mocked(searchYahooInstruments).mockRejectedValue(new Error('Yahoo HTTP 403'));
    await expect(searchInstrumentsMulti('test', ['CN_A', 'US'])).rejects.toThrow('暂不可用');
    vi.mocked(searchInstrumentsScoped).mockRejectedValue(new Error('Eastmoney unavailable'));
    await expect(searchInstrumentsMulti('test', ['CN_A', 'US'])).rejects.toThrow('暂不可用');
  });

  it('only reports no matches when all requested sources successfully return none', async () => {
    vi.mocked(searchInstrumentsScoped).mockResolvedValue([]);
    vi.mocked(searchYahooInstruments).mockResolvedValue([]);
    expect(await searchInstrumentsMulti('no-match', ['CN_A', 'US'])).toEqual([]);
  });

  it('preserves source order and deduplicates results', async () => {
    vi.mocked(searchInstrumentsScoped).mockResolvedValue([cn, { ...us, source: 'eastmoney' }]);
    vi.mocked(searchYahooInstruments).mockResolvedValue([us]);
    expect(await searchInstrumentsMulti('a', ['CN_A', 'US'], 2)).toEqual([cn, { ...us, source: 'eastmoney' }]);
  });
});
