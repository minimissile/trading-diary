import { describe, expect, it } from 'vitest';
import { buildDividendReinvestPlan } from '../src/service/portfolio/dividend-reinvest';
import { resolveDividendEligibleQuantity } from '../src/service/portfolio/dividend-matcher';
import { aggregatePositions, computeOtcFundHoldMetrics } from '../src/service/portfolio/ledger-service';
import type { PortfolioLedgerEntry } from '../src/shared/portfolio/types';

function buy(tradeAt: string, quantity: number, price: number): PortfolioLedgerEntry {
  return {
    id: tradeAt,
    accountId: 'default',
    symbol: '004598',
    kind: 'otc_fund',
    venue: 'OTC',
    side: 'buy',
    quantity,
    price,
    fees: 0,
    planId: null,
    note: '',
    source: 'sip',
    sipOccurrenceId: null,
    cashOutflow: null,
    createdAt: tradeAt,
    tradeAt,
  };
}

describe('004598 otc fund hold metrics', () => {
  const ledger = [
    buy('2026-06-05T00:00:00+08:00', 147.9, 1.3523),
    buy('2026-08-03T00:00:00+08:00', 71.57, 1.3972),
    buy('2026-08-06T00:00:00+08:00', 73.93, 1.3526),
    buy('2026-08-19T00:00:00.000Z', 65.64, 1.3711),
    buy('2026-08-20T00:00:00.000Z', 65.4, 1.3761),
    buy('2026-08-21T00:00:00.000Z', 65.58, 1.3724),
    buy('2026-08-24T00:00:00.000Z', 64.77, 1.3896),
    buy('2026-08-25T00:00:00.000Z', 65.16, 1.3812),
    buy('2026-08-26T00:00:00.000Z', 64.68, 1.3914),
    buy('2026-08-27T00:00:00.000Z', 66.28, 1.3579),
  ];

  it('excludes same-day subscription from dividend eligibility', () => {
    const eligible = resolveDividendEligibleQuantity(
      ledger,
      { exDividendDate: '2026-08-27', recordDate: '2026-08-27' },
      'otc_fund',
    );
    expect(eligible).toBeCloseTo(684.63, 2);
  });

  it('computes reinvest shares aligned with fund app', async () => {
    const eligible = resolveDividendEligibleQuantity(
      ledger,
      { exDividendDate: '2026-08-27', recordDate: '2026-08-27' },
      'otc_fund',
    );
    const plan = await buildDividendReinvestPlan({
      symbol: '004598',
      kind: 'otc_fund',
      cashAmount: eligible * 0.02,
      exDividendDate: '2026-08-27',
      payDate: '2026-08-28',
    });
    expect(plan.quantity).toBe(10.08);
    expect(plan.price).toBeCloseTo(1.3579, 4);
  }, 30_000);

  it('matches fund app hold price and pnl after reinvest', async () => {
    const eligible = resolveDividendEligibleQuantity(
      ledger,
      { exDividendDate: '2026-08-27', recordDate: '2026-08-27' },
      'otc_fund',
    );
    const plan = await buildDividendReinvestPlan({
      symbol: '004598',
      kind: 'otc_fund',
      cashAmount: eligible * 0.02,
      exDividendDate: '2026-08-27',
      payDate: '2026-08-28',
    });
    const entries = [
      ...ledger,
      {
        ...buy('2026-08-28T12:00:00.000Z', plan.quantity, plan.price),
        side: 'dividend_reinvest' as const,
        note: plan.note,
      },
    ];
    const position = aggregatePositions(entries)[0];
    expect(position?.quantity).toBeCloseTo(760.99, 2);

    const hold = computeOtcFundHoldMetrics(entries, 5.92);
    expect(hold.holdPrice).toBeCloseTo(1.3457, 4);

    const nav = 1.3513;
    const pnl = position!.quantity * nav - hold.totalCost;
    expect(pnl).toBeCloseTo(4.25, 1);
  }, 30_000);
});
