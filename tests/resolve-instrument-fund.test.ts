import { describe, expect, it } from 'vitest';
import { resolveInstrument } from '../src/service/market/eastmoney/search-service';

describe('resolveInstrument fund/stock overlap', () => {
  it('resolves 004598 as fund not stock', async () => {
    const instrument = await resolveInstrument('004598');
    expect(instrument.kind).toBe('otc_fund');
    expect(instrument.name).toContain('联接');
  }, 30_000);

  it('still resolves 000001 as stock when exchange quote exists', async () => {
    const instrument = await resolveInstrument('000001');
    expect(instrument.kind).toBe('stock');
  }, 30_000);

  it('keeps 161725 as lof', async () => {
    const instrument = await resolveInstrument('161725');
    expect(instrument.kind).toBe('lof');
  }, 30_000);
});
