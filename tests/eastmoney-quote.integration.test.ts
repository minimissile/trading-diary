import { describe, expect, it } from 'vitest';
import { getQuote } from '../src/service/market/eastmoney/quote-service';
import { resolveInstrument } from '../src/service/market/eastmoney/search-service';

describe('eastmoney quote integration', () => {
  it('fetches A-share quote for 601519', async () => {
    const instrument = await resolveInstrument('601519');
    expect(instrument.kind).toBe('stock');
    expect(instrument.secid).toBe('1.601519');

    const quote = await getQuote('601519');
    expect(quote.symbol).toBe('601519');
    expect(quote.price).not.toBeNull();
    expect(quote.price).toBeGreaterThan(0);
  }, 15_000);
});
