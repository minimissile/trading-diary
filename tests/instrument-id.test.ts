import { describe, expect, it } from 'vitest';
import {
  formatInstrumentSymbol,
  inferCnVenueFromSymbol,
  instrumentPositionKey,
  parseInstrumentInput,
  parseInstrumentPositionKey,
} from '../src/shared/market/instrument-id';

describe('instrument-id', () => {
  it('parses A-share symbols', () => {
    expect(parseInstrumentInput('600519')).toEqual({
      venue: 'SH',
      symbol: '600519',
      quoteCurrency: 'CNY',
    });
    expect(parseInstrumentInput('000001.SZ')).toEqual({
      venue: 'SZ',
      symbol: '000001',
      quoteCurrency: 'CNY',
    });
  });

  it('parses HK symbols', () => {
    expect(parseInstrumentInput('00700.HK')).toEqual({
      venue: 'HK',
      symbol: '00700',
      quoteCurrency: 'HKD',
    });
    expect(parseInstrumentInput('700.HK')).toEqual({
      venue: 'HK',
      symbol: '00700',
      quoteCurrency: 'HKD',
    });
  });

  it('parses US symbols', () => {
    expect(parseInstrumentInput('AAPL')).toEqual({
      venue: 'US',
      symbol: 'AAPL',
      quoteCurrency: 'USD',
    });
    expect(parseInstrumentInput('BRK-B')).toEqual({
      venue: 'US',
      symbol: 'BRK.B',
      quoteCurrency: 'USD',
    });
  });

  it('builds stable position keys', () => {
    const key = instrumentPositionKey({ venue: 'US', symbol: 'AAPL' });
    expect(key).toBe('US:AAPL');
    expect(parseInstrumentPositionKey(key)).toEqual({
      venue: 'US',
      symbol: 'AAPL',
      quoteCurrency: 'USD',
    });
  });

  it('formats display symbols', () => {
    expect(formatInstrumentSymbol({ venue: 'HK', symbol: '00700' })).toBe('00700.HK');
    expect(formatInstrumentSymbol({ venue: 'SH', symbol: '600519' })).toBe('600519.SH');
  });

  it('infers CN venue from code', () => {
    expect(inferCnVenueFromSymbol('600519')).toBe('SH');
    expect(inferCnVenueFromSymbol('300750')).toBe('SZ');
  });
});
