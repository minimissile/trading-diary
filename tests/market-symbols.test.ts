import { describe, expect, it } from 'vitest';
import {
  classifyExchangeCode,
  detectExchangeMarket,
  mapDividendStatus,
  normalizeSymbol,
  toF10Code,
  toSecid,
  venueFromCodeTableRow,
} from '../src/service/market/eastmoney/symbols';

describe('eastmoney symbols', () => {
  it('normalizes symbol casing and suffix', () => {
    expect(normalizeSymbol(' sh601318 ')).toBe('601318');
    expect(normalizeSymbol('601318.SH')).toBe('601318');
  });

  it('maps A 股与 ETF 市场', () => {
    expect(detectExchangeMarket('600519')).toBe('SH');
    expect(detectExchangeMarket('000001')).toBe('SZ');
    expect(detectExchangeMarket('510300')).toBe('SH');
    expect(detectExchangeMarket('159915')).toBe('SZ');
    expect(detectExchangeMarket('110022')).toBeNull();
  });

  it('builds secid and f10 code', () => {
    expect(toSecid('601318')).toBe('1.601318');
    expect(toF10Code('601318')).toBe('SH601318');
    expect(toSecid('110022')).toBeNull();
  });

  it('builds HK/US secid for EastMoney', () => {
    expect(toSecid('06060', 'HK')).toBe('116.06060');
    expect(toSecid('AAPL', 'US')).toBe('105.AAPL');
  });

  it('maps codetable row to venue', () => {
    expect(
      venueFromCodeTableRow({ code: '06060', market: 116, securityTypeName: '港股', smallType: 3 }),
    ).toBe('HK');
    expect(
      venueFromCodeTableRow({ code: 'AAPL', market: 105, securityTypeName: '美股', smallType: 3 }),
    ).toBe('US');
  });

  it('classifies exchange instrument kind', () => {
    expect(classifyExchangeCode('600519')).toBe('stock');
    expect(classifyExchangeCode('510300')).toBe('etf');
    expect(classifyExchangeCode('161725')).toBe('lof');
  });

  it('maps dividend progress text', () => {
    expect(mapDividendStatus('实施分配')).toBe('implemented');
    expect(mapDividendStatus('董事会决议通过')).toBe('proposed');
    expect(mapDividendStatus('股东大会通过')).toBe('announced');
  });
});
