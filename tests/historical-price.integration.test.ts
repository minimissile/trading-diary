import { describe, expect, it } from 'vitest';
import { lookupOtcFundNavOnDate } from '../src/service/market/eastmoney/historical-price-service';
import { enrichSipExtractedRecords } from '../src/service/sip/sip-import-enrichment';
import { toTradeDateKey } from '../src/service/sip/sip-row-normalizer';

describe('historical price integration', () => {
  it('looks up real otc fund nav for a recent date', async () => {
    const result = await lookupOtcFundNavOnDate('110011', '2026-01-02');
    expect(result).not.toBeNull();
    expect(result?.nav).toBeGreaterThan(0);
  }, 30_000);

  it('looks up fund 004598 used in smart sip screenshots', async () => {
    const { lookupHistoricalPriceOnDate } = await import('../src/service/market/eastmoney/historical-price-service');
    const result = await lookupHistoricalPriceOnDate('004598', '2025-06-08');
    expect(result).not.toBeNull();
    expect(result?.nav).toBeGreaterThan(0);
  }, 30_000);

  it('parses common AI date strings', () => {
    expect(toTradeDateKey('2026-08-08')).toBe('2026-08-08');
    expect(toTradeDateKey('2026/08/08')).toBe('2026-08-08');
    expect(toTradeDateKey('2026-8-8')).toBe('2026-08-08');
    expect(toTradeDateKey('2026年8月8日')).toBe('2026-08-08');
  });

  it('enriches 004598 deduction rows from screenshot-like payload', async () => {
    const result = await enrichSipExtractedRecords([
      {
        rowIndex: 1,
        symbol: '004598',
        fundName: '南方中证500ETF联接',
        tradeAt: '2025-06-08',
        nav: null,
        amount: 100,
        quantity: null,
        fees: null,
      },
    ]);

    expect(result.records[0]?.nav).toBeGreaterThan(0);
    expect(result.enrichments.some((item) => item.includes('自动填充') || item.includes('已使用'))).toBe(true);
  }, 30_000);

  it('enriches record end-to-end when symbol and date are present', async () => {
    const result = await enrichSipExtractedRecords([
      {
        rowIndex: 1,
        symbol: '110011',
        fundName: '易方达优质精选',
        tradeAt: '2026-01-02',
        nav: null,
        amount: 500,
        quantity: null,
        fees: null,
      },
    ]);

    expect(result.records[0]?.nav).toBeGreaterThan(0);
    expect(result.enrichments.length).toBeGreaterThan(0);
  }, 30_000);
});
