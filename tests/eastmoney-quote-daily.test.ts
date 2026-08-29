import { describe, expect, it } from 'vitest';
import { deriveDayMoveFromPercent, isPlausiblePrevClose } from '../src/service/market/eastmoney/symbols';
import { getQuote } from '../src/service/market/eastmoney/quote-service';
import { resolveDayChangePerShare } from '../src/service/portfolio/position-daily-pnl';

describe('eastmoney ulist fltt=2 quote parsing', () => {
  it('detects broken prevClose from ulist payload shape', () => {
    expect(isPlausiblePrevClose(140821225.99, 7.32)).toBe(false);
    expect(isPlausiblePrevClose(7.11, 7.32)).toBe(true);
  });

  it('derives day move from price and percent', () => {
    const { prevClose, change } = deriveDayMoveFromPercent(7.32, 2.95);
    expect(prevClose).toBeCloseTo(7.11, 2);
    expect(change).toBeCloseTo(0.21, 2);
  });

  it('maps live ulist quotes with consistent day move', async () => {
    const quote = await getQuote('002387');
    expect(quote.price).toBeCloseTo(7.32, 2);
    expect(quote.changePercent).toBeCloseTo(2.95, 2);
    expect(quote.prevClose).toBeCloseTo(7.11, 2);
    expect(quote.change).toBeCloseTo(0.21, 2);

    const dayChange = resolveDayChangePerShare(quote, quote.price);
    expect(dayChange).toBeCloseTo(0.21, 2);
    expect(500 * (dayChange ?? 0)).toBeCloseTo(105, 0);
  }, 30_000);
});
