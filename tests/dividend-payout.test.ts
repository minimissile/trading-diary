import { describe, expect, it } from 'vitest';
import {
  inferDividendPayoutModeFromEvent,
  resolveDividendPayoutMode,
  supportsDividendPayoutMode,
} from '../src/shared/portfolio/dividend-payout';

describe('dividend payout mode', () => {
  it('detects reinvest from event text', () => {
    expect(inferDividendPayoutModeFromEvent({ planText: '每10份派1元', progress: '红利再投资' })).toBe('reinvest');
    expect(inferDividendPayoutModeFromEvent({ planText: '现金分红', progress: '实施' })).toBe('cash');
  });

  it('supports fund kinds only', () => {
    expect(supportsDividendPayoutMode('otc_fund')).toBe(true);
    expect(supportsDividendPayoutMode('stock')).toBe(false);
  });

  it('falls back to default mode for new fund records', () => {
    expect(
      resolveDividendPayoutMode({
        kind: 'otc_fund',
        defaultMode: 'reinvest',
      }),
    ).toBe('reinvest');
    expect(
      resolveDividendPayoutMode({
        kind: 'stock',
        defaultMode: 'reinvest',
      }),
    ).toBe('cash');
  });
});
