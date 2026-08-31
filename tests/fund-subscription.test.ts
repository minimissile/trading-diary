import { describe, expect, it } from 'vitest';
import { quantityPresetForKind, priceListPresetForKind } from '../src/shared/format/display-presets';
import { nextTradingDay } from '../src/shared/trade-calendar';
import {
  computeFundQuantityFromAmount,
  resolveFundConfirmationNavDate,
} from '../src/service/portfolio/fund-subscription';
import { computeOtcFundHoldMetrics } from '../src/service/portfolio/ledger-service';
import { computeReferenceUnrealizedPnl } from '../src/service/portfolio/reference-unrealized-pnl';
import { FEE_PROFILE_A_SHARE_STANDARD } from '../src/shared/accounts/fee-presets';
import type { PortfolioLedgerEntry } from '../src/shared/portfolio/types';

describe('fund subscription helpers', () => {
  it('uses next trading day for fund confirmation nav lookup', () => {
    expect(resolveFundConfirmationNavDate('2026-01-19T14:39:54+08:00')).toBe('2026-01-20');
    expect(nextTradingDay('2026-01-23')).toBe('2026-01-26');
  });

  it('rounds fund quantity to 2 decimals', () => {
    expect(computeFundQuantityFromAmount(100, 2.5751, 0.1)).toBeCloseTo(38.79, 2);
    expect(computeFundQuantityFromAmount(99.9, 2.512, 0.1, true)).toBeCloseTo(39.77, 2);
  });
});

describe('otc fund-app alignment', () => {
  it('uses fund quantity and price presets for otc_fund', () => {
    expect(quantityPresetForKind('otc_fund')).toBe('quantity');
    expect(priceListPresetForKind('otc_fund')).toBe('priceList');
    expect(quantityPresetForKind('lof')).toBe('quantityShares');
  });

  it('computes hold metrics and pnl like Ant Fortune for 161226', () => {
    function buy(tradeAt: string, quantity: number, price: number, cashOutflow: number): PortfolioLedgerEntry {
      return {
        id: tradeAt,
        accountId: 'default',
        symbol: '161226',
        kind: 'otc_fund',
        venue: 'OTC',
        side: 'buy',
        quantity,
        price,
        fees: 0.1,
        cashOutflow,
        planId: null,
        note: '',
        source: 'ai_import',
        sipOccurrenceId: null,
        createdAt: tradeAt,
        tradeAt,
      };
    }

    const entries = [
      buy('2026-01-19T14:39:54+08:00', 39.77, 2.512, 100),
      buy('2026-01-20T10:49:48+08:00', 38.28, 2.6059, 100),
      buy('2026-01-21T10:43:04+08:00', 38.45, 2.598, 100),
    ];
    const hold = computeOtcFundHoldMetrics(entries, 0);
    const nav = 1.9029;

    expect(hold.holdPrice).toBeCloseTo(2.5751, 4);
    expect(entries.reduce((sum, entry) => sum + entry.quantity, 0)).toBeCloseTo(116.5, 2);

    const pnl = computeReferenceUnrealizedPnl({
      marketPrice: nav,
      quantity: 116.5,
      totalCost: hold.totalCost,
      kind: 'otc_fund',
      market: 'OTC',
      feeProfile: FEE_PROFILE_A_SHARE_STANDARD,
    });

    expect(116.5 * nav).toBeCloseTo(221.69, 1);
    expect(pnl).toBeCloseTo(-78.31, 1);
  });
});
