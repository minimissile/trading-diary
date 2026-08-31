import { describe, expect, it, vi } from 'vitest';
import { enrichLedgerExtractedRecords } from '../src/service/portfolio/ledger-import-enrichment';
import * as historicalPrice from '../src/service/market/eastmoney/historical-price-service';

const sipListRow = {
  rowIndex: 2,
  symbol: '161226',
  instrumentName: '国投瑞银白银期货(LOF)A',
  side: 'buy' as const,
  tradeAt: '2026-01-20 10:49:48',
  price: null,
  quantity: null,
  amount: 100,
  fees: null,
  note: null,
  rawType: '定投',
  recordKind: 'sip_deduction' as const,
  tradeChannel: null,
  confirmAt: null,
  amountIsNetConfirmed: false,
  sourceImageIndex: 0,
  sourceFileName: 'list.png',
};

describe('ledger import enrichment', () => {
  it('does not auto-fill fund trade rows missing confirmation data', async () => {
    const lookupSpy = vi.spyOn(historicalPrice, 'lookupImportPriceOnDate');

    const result = await enrichLedgerExtractedRecords(
      [
        {
          rowIndex: 1,
          symbol: '161226',
          instrumentName: '国投瑞银白银期货(LOF)A',
          side: 'buy',
          tradeAt: '2026-01-19',
          price: null,
          quantity: null,
          amount: 100,
          fees: null,
          note: null,
          rawType: '买入',
          recordKind: 'trade',
          tradeChannel: null,
          confirmAt: null,
          amountIsNetConfirmed: false,
          sourceImageIndex: 0,
          sourceFileName: 'list.png',
        },
      ],
      { importAssetKind: 'fund', recalculateDerivedFields: true },
    );

    expect(lookupSpy).not.toHaveBeenCalled();
    expect(result.records[0]?.price).toBeNull();
    expect(result.enrichments.some((item) => item.includes('记录详情'))).toBe(true);

    lookupSpy.mockRestore();
  });

  it('derives sip deduction nav and quantity from list amount', async () => {
    vi.spyOn(historicalPrice, 'lookupImportPriceOnDate').mockResolvedValue({
      nav: 2.5727,
      navDate: '2026-01-21',
      exact: true,
      kind: 'lof',
    });

    const result = await enrichLedgerExtractedRecords([sipListRow], {
      importAssetKind: 'fund',
      recalculateDerivedFields: true,
    });

    expect(result.records[0]?.price).toBeCloseTo(2.5727);
    expect(result.records[0]?.quantity).toBeCloseTo(38.87, 1);
    expect(result.records[0]?.fees).toBeCloseTo(0.1);

    vi.restoreAllMocks();
  });
});
