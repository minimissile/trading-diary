import { describe, expect, it } from 'vitest';
import { quantityFromFraction, roundSellQuantity } from '../src/shared/portfolio/sell-quantity';

describe('sell quantity helpers', () => {
  it('rounds stock quantity to whole shares', () => {
    expect(roundSellQuantity(1200 * (1 / 3), 'stock')).toBe(400);
    expect(quantityFromFraction(1200, 1 / 3, 'stock')).toBe(400);
    expect(quantityFromFraction(1200, 1, 'stock')).toBe(1200);
  });
});
