import { describe, expect, it } from 'vitest';
import {
  buildLedgerAiEmptyRecordsError,
  extractJsonText,
  mergeLedgerExtractedRecords,
  parseLedgerAiImportResponse,
} from '../src/service/portfolio/ledger-ai-import-parser';
import { normalizeLedgerTradeRecord } from '../src/service/portfolio/ledger-row-normalizer';

describe('ledger ai import parser', () => {
  it('extracts JSON from markdown fences', () => {
    const raw = '说明\n```json\n{"records":[{"symbol":"000158","side":"buy"}]}\n```';
    expect(extractJsonText(raw)).toContain('"records"');
  });

  it('parses stock trade records from 同花顺-style response', () => {
    const parsed = parseLedgerAiImportResponse(
      JSON.stringify({
        screenshotType: 'trade_history',
        records: [
          {
            symbol: '000158',
            instrumentName: '常山北明',
            side: 'buy',
            tradeDate: '2024-03-15',
            price: 8.52,
            quantity: 1000,
            amount: 8520,
            fees: 5,
            rawType: '买入',
            recordKind: 'trade',
          },
          {
            symbol: '000158',
            instrumentName: '常山北明',
            side: 'sell',
            tradeDate: '2024-06-20',
            price: 9.18,
            quantity: 500,
            rawType: '卖出',
            recordKind: 'trade',
          },
        ],
      }),
    );

    expect(parsed.records).toHaveLength(2);
    expect(parsed.records[0]?.symbol).toBe('000158');
    expect(parsed.records[0]?.instrumentName).toBe('常山北明');
    expect(parsed.records[0]?.side).toBe('buy');
    expect(parsed.records[1]?.side).toBe('sell');
  });

  it('parses otc fund subscription and sip deduction', () => {
    const parsed = parseLedgerAiImportResponse(
      JSON.stringify({
        screenshotType: 'mixed',
        planMode: 'fixed',
        records: [
          {
            fundCode: '004598',
            fundName: '某场外基金',
            side: 'buy',
            confirmDate: '2026-01-10',
            unitNav: '1.3457',
            confirmShares: '100.12',
            confirmAmount: '134.73',
            rawType: '申购',
            recordKind: 'trade',
          },
          {
            fundCode: '110011',
            fundName: '易方达优质精选',
            tradeDate: '2026-01-15',
            nav: 5.1,
            amount: 500,
            rawType: '定投',
            recordKind: 'sip_deduction',
          },
        ],
      }),
    );

    expect(parsed.records.filter((r) => r.recordKind === 'trade')).toHaveLength(1);
    expect(parsed.records.find((r) => r.recordKind === 'sip_deduction')?.symbol).toBe('110011');
    expect(parsed.records.find((r) => r.recordKind === 'trade')?.price).toBeCloseTo(1.3457);
  });

  it('parses ant fortune fund detail for 161226 on 2026-01-19', () => {
    const parsed = parseLedgerAiImportResponse(
      JSON.stringify({
        screenshotType: 'trade_history',
        records: [
          {
            fundCode: '161226',
            instrumentName: '国投瑞银白银期货(LOF)A',
            side: 'buy',
            tradeDate: '2026-01-19',
            purchaseTime: '2026-01-19 14:39:54',
            confirmDate: '2026-01-20',
            amount: 100,
            confirmAmount: 99.9,
            unitNav: 2.512,
            confirmShares: 39.77,
            fees: 0.1,
            rawType: '买入',
            recordKind: 'trade',
          },
        ],
      }),
    );

    const record = parsed.records[0]!;
    expect(record.tradeAt).toBe('2026-01-19 14:39:54');
    expect(record.confirmAt).toBe('2026-01-20');
    expect(record.price).toBeCloseTo(2.512);
    expect(record.quantity).toBeCloseTo(39.77);
    expect(record.amount).toBeCloseTo(99.9);
    expect(record.amountIsNetConfirmed).toBe(true);
    expect(record.fees).toBeCloseTo(0.1);
  });

  it('merges list row with confirm-only detail on T+1', () => {
    const merged = mergeLedgerExtractedRecords([
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
      {
        rowIndex: 2,
        symbol: '161226',
        instrumentName: '国投瑞银白银期货(LOF)A',
        side: 'buy',
        tradeAt: null,
        price: 2.512,
        quantity: 39.77,
        amount: 99.9,
        fees: 0.1,
        note: null,
        rawType: '买入',
        recordKind: 'trade',
        tradeChannel: null,
        confirmAt: '2026-01-20',
        amountIsNetConfirmed: true,
        sourceImageIndex: 1,
        sourceFileName: 'detail.png',
      },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.tradeAt).toBe('2026-01-19');
    expect(merged[0]?.confirmAt).toBe('2026-01-20');
    expect(merged[0]?.quantity).toBeCloseTo(39.77);
    expect(merged[0]?.price).toBeCloseTo(2.512);
  });

  it('merges sparse list row with fund detail row', () => {
    const merged = mergeLedgerExtractedRecords([
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
      {
        rowIndex: 2,
        symbol: '161226',
        instrumentName: '国投瑞银白银期货(LOF)A',
        side: 'buy',
        tradeAt: '2026-01-19 14:39:54',
        price: 2.512,
        quantity: 39.77,
        amount: 99.9,
        fees: 0.1,
        note: null,
        rawType: '买入',
        recordKind: 'trade',
        tradeChannel: null,
        confirmAt: '2026-01-20',
        amountIsNetConfirmed: true,
        sourceImageIndex: 1,
        sourceFileName: 'detail.png',
      },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.price).toBeCloseTo(2.512);
    expect(merged[0]?.quantity).toBeCloseTo(39.77);
    expect(merged[0]?.amount).toBeCloseTo(99.9);
  });

  it('parses tradeChannel from fund app response', () => {
    const parsed = parseLedgerAiImportResponse(
      JSON.stringify({
        tradeChannel: 'otc',
        tradeChannelLabel: '蚂蚁财富',
        screenshotType: 'trade_history',
        records: [
          {
            fundCode: '161226',
            fundName: '国投白银LOF',
            side: 'buy',
            tradeDate: '2026-01-19',
            amount: 100,
            rawType: '买入',
            recordKind: 'trade',
          },
        ],
      }),
    );

    expect(parsed.tradeChannel).toBe('otc');
    expect(parsed.tradeChannelLabel).toBe('蚂蚁财富');
    expect(parsed.records[0]?.tradeChannel).toBeNull();
  });

  it('marks dividend rows and adds warning', () => {
    const parsed = parseLedgerAiImportResponse(
      JSON.stringify({
        records: [
          {
            symbol: '000001',
            rawType: '现金分红',
            tradeDate: '2025-07-01',
            amount: 120,
            recordKind: 'dividend',
          },
        ],
      }),
    );

    expect(parsed.records[0]?.recordKind).toBe('dividend');
    expect(parsed.warnings.some((w) => w.includes('分红'))).toBe(true);
  });

  it('accepts null planHints from llm response', () => {
    const parsed = parseLedgerAiImportResponse(
      JSON.stringify({
        screenshotType: 'trade_history',
        planHints: null,
        records: [
          {
            symbol: '000158',
            instrumentName: '常山北明',
            side: 'buy',
            tradeDate: '2024-03-15',
            price: 8.52,
            quantity: 1000,
            recordKind: 'trade',
          },
        ],
      }),
    );

    expect(parsed.planHints).toBeNull();
    expect(parsed.records).toHaveLength(1);
  });

  it('merges duplicate records across images', () => {
    const records = mergeLedgerExtractedRecords([
      {
        rowIndex: 1,
        symbol: '000158',
        instrumentName: '常山北明',
        side: 'buy',
        tradeAt: '2024-03-15',
        price: 8.52,
        quantity: 1000,
        amount: 8520,
        fees: 5,
        note: null,
        rawType: '买入',
        recordKind: 'trade',
        tradeChannel: null,
        confirmAt: null,
        amountIsNetConfirmed: false,
        sourceImageIndex: 0,
        sourceFileName: 'a.png',
      },
      {
        rowIndex: 2,
        symbol: '000158',
        instrumentName: '常山北明',
        side: 'buy',
        tradeAt: '2024-03-15',
        price: 8.52,
        quantity: 1000,
        amount: 8520,
        fees: 5,
        note: null,
        rawType: '买入',
        recordKind: 'trade',
        tradeChannel: null,
        confirmAt: null,
        amountIsNetConfirmed: false,
        sourceImageIndex: 1,
        sourceFileName: 'b.png',
      },
    ]);

    expect(records).toHaveLength(1);
    expect(records[0]?.rowIndex).toBe(1);
  });

  it('does not merge sip deductions on adjacent days', () => {
    const merged = mergeLedgerExtractedRecords([
      {
        rowIndex: 1,
        symbol: '161226',
        instrumentName: '国投瑞银白银期货(LOF)A',
        side: 'buy',
        tradeAt: '2026-01-20 10:49:48',
        price: null,
        quantity: null,
        amount: 100,
        fees: null,
        note: null,
        rawType: '定投',
        recordKind: 'sip_deduction',
        tradeChannel: null,
        confirmAt: null,
        amountIsNetConfirmed: false,
        sourceImageIndex: 0,
        sourceFileName: 'a.png',
      },
      {
        rowIndex: 2,
        symbol: '161226',
        instrumentName: '国投瑞银白银期货(LOF)A',
        side: 'buy',
        tradeAt: '2026-01-21 10:43:04',
        price: null,
        quantity: null,
        amount: 100,
        fees: null,
        note: null,
        rawType: '定投',
        recordKind: 'sip_deduction',
        tradeChannel: null,
        confirmAt: null,
        amountIsNetConfirmed: false,
        sourceImageIndex: 0,
        sourceFileName: 'b.png',
      },
    ]);

    expect(merged).toHaveLength(2);
    expect(merged[0]?.tradeAt).toContain('2026-01-20');
    expect(merged[1]?.tradeAt).toContain('2026-01-21');
  });

  it('builds helpful empty error for position summary screenshots', () => {
    const message = buildLedgerAiEmptyRecordsError({
      warnings: [],
      screenshotType: 'position_summary',
    });
    expect(message).toContain('持仓汇总');
  });
});

describe('ledger row normalizer', () => {
  it('normalizes complete trade record', () => {
    const result = normalizeLedgerTradeRecord({
      rowIndex: 1,
      symbol: '000158',
      instrumentName: '常山北明',
      side: 'buy',
      tradeAt: '2024-03-15',
      price: 8.52,
      quantity: 1000,
      amount: 8520,
      fees: 5,
      note: null,
      rawType: '买入',
      recordKind: 'trade',
      tradeChannel: null,
      confirmAt: null,
      amountIsNetConfirmed: false,
      sourceImageIndex: 0,
      sourceFileName: null,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.symbol).toBe('000158');
      expect(result.value.quantity).toBe(1000);
    }
  });

  it('derives quantity from amount and price', () => {
    const result = normalizeLedgerTradeRecord({
      rowIndex: 1,
      symbol: '004598',
      instrumentName: null,
      side: 'buy',
      tradeAt: '2026-01-10',
      price: 1.3457,
      quantity: null,
      amount: 134.73,
      fees: null,
      note: null,
      rawType: '申购',
      recordKind: 'trade',
      tradeChannel: null,
      confirmAt: null,
      amountIsNetConfirmed: false,
      sourceImageIndex: 0,
      sourceFileName: null,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.quantity).toBeCloseTo(100.12, 1);
    }
  });
});
