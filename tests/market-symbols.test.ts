import { describe, expect, it } from 'vitest';
import {
  classifyExchangeCode,
  detectExchangeMarket,
  mapDividendStatus,
  normalizeSymbol,
  toF10Code,
  toSecid,
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
