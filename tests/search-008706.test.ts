import { describe, expect, it } from 'vitest';
import { searchInstrumentsScoped, resolveInstrument } from '../src/service/market/eastmoney/search-service';

describe('search 008706 OTC fund', () => {
  it('finds fund in search suggestions with small limit', async () => {
    const hits = await searchInstrumentsScoped('008706', ['CN_A'], 4);
    expect(hits.some((hit) => hit.symbol === '008706' && hit.kind === 'otc_fund')).toBe(true);
  });

  it('merges fund search when codetable is empty', async () => {
    const hits = await searchInstrumentsScoped('建信富时100', ['CN_A'], 8);
    expect(hits.some((hit) => hit.symbol === '008706' && hit.kind === 'otc_fund')).toBe(true);
  });

  it('prefers exact otc fund match over exchange rows with same prefix', async () => {
    const hits = await searchInstrumentsScoped('008706', ['CN_A'], 8);
    expect(hits[0]?.symbol).toBe('008706');
    expect(hits[0]?.kind).toBe('otc_fund');
  });

  it('resolves as otc_fund', async () => {
    const info = await resolveInstrument('008706');
    expect(info.symbol).toBe('008706');
    expect(info.kind).toBe('otc_fund');
  });
});
