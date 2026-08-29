import { describe, expect, it } from 'vitest';
import {
  buildSipAiEmptyRecordsError,
  extractJsonText,
  parseSipAiImportResponse,
} from '../src/service/sip/sip-ai-import-parser';

describe('sip ai import parser', () => {
  it('extracts JSON from markdown fences', () => {
    const raw = '说明\n```json\n{"records":[{"amount":500,"tradeDate":"2026-01-01"}]}\n```';
    expect(extractJsonText(raw)).toContain('"records"');
    const parsed = parseSipAiImportResponse(raw);
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0]?.amount).toBe(500);
  });

  it('accepts alternate record field names', () => {
    const parsed = parseSipAiImportResponse(
      JSON.stringify({
        planMode: 'smart',
        planModeLabel: '智能定投',
        transactions: [
          {
            code: '110011',
            name: '易方达优质精选',
            confirmDate: '2026-02-03',
            confirmAmount: '620',
            unitNav: '5.1',
            confirmShares: '121.5',
          },
        ],
      }),
    );

    expect(parsed.records[0]?.symbol).toBe('110011');
    expect(parsed.records[0]?.amount).toBe(620);
    expect(parsed.planMode).toBe('smart');
  });

  it('builds plan settings guidance when no records found', () => {
    const message = buildSipAiEmptyRecordsError({
      warnings: [],
      planModeLabel: '智能定投',
      screenshotType: 'plan_settings',
    });
    expect(message).toContain('扣款记录');
    expect(message).toContain('智能定投');
  });

  it('creates draft record from plan hints when no deduction rows', () => {
    const parsed = parseSipAiImportResponse(
      JSON.stringify({
        screenshotType: 'plan_settings',
        planMode: 'smart',
        planModeLabel: '智能定投',
        planHints: {
          fundName: '易方达优质精选',
          amount: 500,
          startDate: '2026-01-01',
        },
        records: [],
      }),
    );

    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0]?.fundName).toBe('易方达优质精选');
    expect(parsed.records[0]?.amount).toBe(500);
    expect(parsed.records[0]?.nav).toBeNull();
    expect(parsed.planHints?.fundName).toBe('易方达优质精选');
    expect(parsed.warnings.some((warning) => warning.includes('待补全'))).toBe(true);
  });

  it('keeps partial records instead of dropping them', () => {
    const parsed = parseSipAiImportResponse(
      JSON.stringify({
        records: [{ fundName: '招商中证白酒', amount: 500 }],
      }),
    );

    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0]?.symbol).toBeNull();
    expect(parsed.records[0]?.amount).toBe(500);
  });
});
