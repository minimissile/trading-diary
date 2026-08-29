import { describe, expect, it } from 'vitest';
import { normalizeSymbol } from '../src/service/market/eastmoney/symbols';

describe('portfolio quote symbol lookup', () => {
  it('matches quotes when ledger symbol includes exchange suffix', () => {
    const quotes = new Map([['601519', { price: 12.34 }]]);
    const positionSymbol = '601519.SH';
    expect(quotes.get(normalizeSymbol(positionSymbol))).toEqual({ price: 12.34 });
  });
});
