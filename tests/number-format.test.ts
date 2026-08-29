import { describe, expect, it } from 'vitest';
import { formatDisplayCurrency, formatNumber } from '../src/shared/format/number-format';
import {
  DISPLAY_PRESETS,
  animationDecimalPlacesForPreset,
  formatWithPreset,
  signedTone,
  signedToneClass,
} from '../src/shared/format/display-presets';

describe('formatNumber', () => {
  it('formats with thousand separators', () => {
    expect(formatNumber(1234567.89, { useGrouping: true, maximumFractionDigits: 2 })).toBe('1,234,567.89');
  });

  it('trims trailing zeros up to maximum fraction digits', () => {
    expect(formatNumber(1.01, { maximumFractionDigits: 4 })).toBe('1.01');
    expect(formatNumber(1.010_000_1, { maximumFractionDigits: 4 })).toBe('1.01');
    expect(formatNumber(2, { maximumFractionDigits: 4 })).toBe('2');
  });

  it('adds signed prefix for positive and negative values', () => {
    expect(formatNumber(3.5, { signed: true, maximumFractionDigits: 2 })).toBe('+3.5');
    expect(formatNumber(-3.5, { signed: true, maximumFractionDigits: 2 })).toBe('-3.5');
    expect(formatNumber(0, { signed: true, maximumFractionDigits: 2 })).toBe('0');
  });

  it('returns fallback for invalid values', () => {
    expect(formatNumber(null)).toBe('—');
    expect(formatNumber(undefined, { fallback: 'N/A' })).toBe('N/A');
  });
});

describe('formatDisplayCurrency', () => {
  it('formats currency with sign prefix and trimmed zeros', () => {
    expect(formatDisplayCurrency(1200.5, { signed: true })).toBe('+¥1,200.5');
    expect(formatDisplayCurrency(-88.2, { signed: true })).toBe('-¥88.2');
    expect(formatDisplayCurrency(5340)).toBe('¥5,340');
  });
});

describe('display presets', () => {
  it('defines stable preset kinds', () => {
    expect(Object.keys(DISPLAY_PRESETS)).toEqual([
      'currency',
      'pnl',
      'price',
      'priceStock',
      'priceFund',
      'quantity',
      'quantityShares',
      'percent',
    ]);
  });

  it('formats currency preset with symbol and trimmed zeros', () => {
    expect(formatWithPreset(5340, 'currency')).toBe('¥5,340');
    expect(formatWithPreset(6669.9, 'currency')).toBe('¥6,669.9');
    expect(formatWithPreset(101.05, 'currency')).toBe('¥101.05');
  });

  it('formats pnl preset with sign, currency, and trimmed zeros', () => {
    expect(formatWithPreset(901.85, 'pnl')).toBe('+¥901.85');
    expect(formatWithPreset(898.1, 'pnl')).toBe('+¥898.1');
    expect(formatWithPreset(-12.3, 'pnl')).toBe('-¥12.3');
  });

  it('formats price preset with trimmed zeros', () => {
    expect(formatWithPreset(1.01, 'price')).toBe('1.01');
    expect(formatWithPreset(8.9, 'price')).toBe('8.9');
  });

  it('formats stock price with fixed 2 decimals', () => {
    expect(formatWithPreset(8.9, 'priceStock')).toBe('8.90');
    expect(formatWithPreset(2.6598, 'priceStock')).toBe('2.66');
  });

  it('formats fund price with trimmed zeros', () => {
    expect(formatWithPreset(1.149, 'priceFund')).toBe('1.149');
    expect(formatWithPreset(1.002, 'priceFund')).toBe('1.002');
  });

  it('formats quantity presets by asset type', () => {
    expect(formatWithPreset(500, 'quantityShares')).toBe('500');
    expect(formatWithPreset(87.03, 'quantity')).toBe('87.03');
  });

  it('formats percent preset', () => {
    expect(formatWithPreset(1.234, 'percent')).toBe('+1.23%');
  });

  it('maps animation decimal places to preset precision', () => {
    expect(animationDecimalPlacesForPreset('pnl')).toBe(2);
    expect(animationDecimalPlacesForPreset('priceStock')).toBe(2);
    expect(animationDecimalPlacesForPreset('priceFund')).toBe(4);
    expect(animationDecimalPlacesForPreset('quantityShares')).toBe(0);
  });
});

describe('signedToneClass', () => {
  it('returns profit and loss classes', () => {
    expect(signedTone(1)).toBe('profit');
    expect(signedTone(-1)).toBe('loss');
    expect(signedTone(0)).toBe('neutral');
    expect(signedToneClass(1)).toBe('td-value--profit');
    expect(signedToneClass(-1)).toBe('td-value--loss');
    expect(signedToneClass(0)).toBe('');
  });
});

/** 文档 NUMBER_FORMAT.md 中的硬性约定，防止回归。 */
describe('number format contract', () => {
  it('currency amounts always include yen symbol', () => {
    expect(formatWithPreset(5340, 'currency').startsWith('¥')).toBe(true);
    expect(formatWithPreset(101.05, 'currency').startsWith('¥')).toBe(true);
  });

  it('currency amounts never show trailing .00', () => {
    expect(formatWithPreset(5340, 'currency')).toBe('¥5,340');
    expect(formatWithPreset(5340, 'currency')).not.toMatch(/\.00$/u);
  });

  it('pnl amounts include sign and yen symbol with trimmed zeros', () => {
    expect(formatWithPreset(898.1, 'pnl')).toBe('+¥898.1');
    expect(formatWithPreset(-12.3, 'pnl')).toBe('-¥12.3');
    expect(formatWithPreset(898.1, 'pnl')).not.toMatch(/\.10$/u);
  });
});
