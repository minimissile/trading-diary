import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { estimateTradeFees } from '../src/service/accounts/fee-calculator';
import { computeExchangeTradedNetCashInvested } from '../src/service/portfolio/ledger-service';
import { computeReferenceReturnPercent, computeReferenceUnrealizedPnl } from '../src/service/portfolio/reference-unrealized-pnl';
import { getQuote } from '../src/service/market/eastmoney/quote-service';
import type { FeeProfileRates } from '../src/shared/accounts/types';
import type { PortfolioLedgerEntry } from '../src/shared/portfolio/types';

const DB_PATH = process.env.TRADING_DIARY_TEST_DB ?? '';

type LedgerRow = {
  id: string;
  account_id: string;
  symbol: string;
  venue: string;
  kind: string;
  side: 'buy' | 'sell';
  quantity_micros: number;
  price_micros: number;
  fees_cents: number;
  trade_at: string;
  created_at: string;
};

type FeeProfileRow = {
  commission_wan: number;
  commission_min_cents: number;
  etf_commission_wan: number | null;
  etf_commission_min_cents: number | null;
  etf_sh_commission_wan: number | null;
  etf_sh_commission_min_cents: number | null;
  etf_sz_commission_wan: number | null;
  etf_sz_commission_min_cents: number | null;
  hk_commission_wan: number | null;
  hk_commission_min_cents: number | null;
  us_commission_wan: number | null;
  us_commission_min_cents: number | null;
  us_commission_per_share_micros: number | null;
  stamp_duty_rate_ppm: number;
  transfer_fee_rate_ppm: number;
  transfer_fee_min_cents: number;
  other_fee_cents: number;
};

function mapFeeProfile(row: FeeProfileRow): FeeProfileRates {
  return {
    commissionWan: row.commission_wan,
    commissionMinCents: row.commission_min_cents,
    etfCommissionWan: row.etf_commission_wan,
    etfCommissionMinCents: row.etf_commission_min_cents,
    etfShCommissionWan: row.etf_sh_commission_wan,
    etfShCommissionMinCents: row.etf_sh_commission_min_cents,
    etfSzCommissionWan: row.etf_sz_commission_wan,
    etfSzCommissionMinCents: row.etf_sz_commission_min_cents,
    hkCommissionWan: row.hk_commission_wan,
    hkCommissionMinCents: row.hk_commission_min_cents,
    usCommissionWan: row.us_commission_wan,
    usCommissionMinCents: row.us_commission_min_cents,
    usCommissionPerShare: row.us_commission_per_share_micros === null ? null : row.us_commission_per_share_micros / 10_000,
    stampDutyRatePpm: row.stamp_duty_rate_ppm,
    transferFeeRatePpm: row.transfer_fee_rate_ppm,
    transferFeeMinCents: row.transfer_fee_min_cents,
    otherFeeCents: row.other_fee_cents,
  };
}

function mapLedgerEntry(row: LedgerRow): PortfolioLedgerEntry {
  return {
    id: row.id,
    accountId: row.account_id,
    symbol: row.symbol,
    venue: row.venue as PortfolioLedgerEntry['venue'],
    kind: row.kind as PortfolioLedgerEntry['kind'],
    side: row.side,
    quantity: Math.abs(row.quantity_micros) / 10_000,
    price: row.price_micros / 10_000,
    fees: row.fees_cents / 100,
    tradeAt: row.trade_at,
    planId: null,
    note: '',
    source: 'manual',
    sipOccurrenceId: null,
    cashOutflow: null,
    createdAt: row.created_at,
  };
}

describe('002100 live DB', () => {
  it.skipIf(!existsSync(DB_PATH))(
    'deducts estimated sell fees from live ledger and quote',
    async () => {
      const db = new DatabaseSync(DB_PATH, { readOnly: true });
      const ledgerRows = db
        .prepare(`SELECT * FROM portfolio_ledger WHERE symbol = '002100' ORDER BY trade_at`)
        .all() as LedgerRow[];
      const feeRow = db
        .prepare(
          `SELECT fp.* FROM portfolio_ledger pl
         JOIN portfolio_accounts pa ON pa.id = pl.account_id
         JOIN fee_profiles fp ON fp.id = pa.fee_profile_id
         WHERE pl.symbol = '002100' LIMIT 1`,
        )
        .get() as FeeProfileRow;
      const cashDividends = (
        db
          .prepare(
            `SELECT cash_amount_cents FROM portfolio_dividends
           WHERE symbol = '002100' AND status = 'confirmed' AND payout_mode = 'cash'`,
          )
          .all() as Array<{ cash_amount_cents: number }>
      ).reduce((sum, row) => sum + row.cash_amount_cents / 100, 0);

      const entries = ledgerRows.map(mapLedgerEntry);
      const netCash = computeExchangeTradedNetCashInvested(entries, cashDividends);
      const quantity = entries.reduce((sum, entry) => sum + (entry.side === 'buy' ? entry.quantity : -entry.quantity), 0);
      const quote = await getQuote('002100');

      expect(netCash).toBeCloseTo(3281.83, 2);
      expect(cashDividends).toBeCloseTo(31.2, 2);
      expect(quote.price).not.toBeNull();

      const feeProfile = mapFeeProfile(feeRow);
      const grossFromQuote = quantity * quote.price! - netCash;
      const sellFees = estimateTradeFees(
        {
          side: 'sell',
          market: 'SZ',
          price: quote.price!,
          quantity,
          instrumentKind: 'stock',
        },
        feeProfile,
      );

      const pnl = computeReferenceUnrealizedPnl({
        marketPrice: quote.price!,
        quantity,
        totalCost: netCash,
        kind: 'stock',
        market: 'SZ',
        feeProfile,
      });

      expect(pnl).toBeCloseTo(grossFromQuote - sellFees.totalFees, 2);
      expect(computeReferenceReturnPercent(pnl, netCash)).toBeCloseTo((pnl / netCash) * 100, 2);
    },
    30_000,
  );
});
