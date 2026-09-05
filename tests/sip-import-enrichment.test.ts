import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SipAiExtractedRecord } from '../src/shared/sip/import-types';
import { enrichSipExtractedRecords } from '../src/service/sip/sip-import-enrichment';
import { marketService } from '../src/service/market/market-service';

vi.mock('../src/service/market/eastmoney/search-service', () => ({
  searchInstruments: vi.fn(() => Promise.resolve([])),
}));

describe('sip import enrichment', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fills missing nav from historical lookup when symbol and date are present', async () => {
    vi.spyOn(marketService, 'lookupHistoricalPriceOnDate').mockResolvedValue({
      nav: 5.2,
      navDate: '2026-01-02',
      exact: true,
      kind: 'otc_fund',
    });

    const records: SipAiExtractedRecord[] = [
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
    ];

    const result = await enrichSipExtractedRecords(records);
    expect(result.records[0]?.nav).toBe(5.2);
    expect(result.enrichments.some((item) => item.includes('自动填充'))).toBe(true);
  });

  it('uses nearest prior nav when exact date is unavailable', async () => {
    vi.spyOn(marketService, 'lookupHistoricalPriceOnDate').mockResolvedValue({
      nav: 4.18,
      navDate: '2026-01-01',
      exact: false,
      kind: 'otc_fund',
    });

    const result = await enrichSipExtractedRecords([
      {
        rowIndex: 1,
        symbol: '110011',
        fundName: null,
        tradeAt: '2026-01-02',
        nav: null,
        amount: 500,
        quantity: null,
        fees: null,
      },
    ]);

    expect(result.records[0]?.nav).toBe(4.18);
    expect(result.enrichments.some((item) => item.includes('已使用 2026-01-01'))).toBe(true);
  });

  it('skips lookup when nav is already present', async () => {
    const lookup = vi.spyOn(marketService, 'lookupHistoricalPriceOnDate').mockResolvedValue({
      nav: 9.9,
      navDate: '2026-01-02',
      exact: true,
      kind: 'otc_fund',
    });

    const result = await enrichSipExtractedRecords([
      {
        rowIndex: 1,
        symbol: '110011',
        fundName: null,
        tradeAt: '2026-01-02',
        nav: 5.2,
        amount: 500,
        quantity: null,
        fees: null,
      },
    ]);

    expect(lookup).not.toHaveBeenCalled();
    expect(result.records[0]?.nav).toBe(5.2);
    expect(result.enrichments).toEqual([]);
  });
});
