import type { DividendEvent } from '../../shared/market/types';
import type { PortfolioLedgerEntry } from '../../shared/portfolio/types';
import type { UpsertPortfolioDividendInput } from './portfolio-database';
import { recordDateFromExDate, snapshotQuantityAt } from './ledger-service';

export interface DividendMatchInput {
  accountId: string;
  symbol: string;
  kind: PortfolioLedgerEntry['kind'];
  ledger: readonly PortfolioLedgerEntry[];
  event: DividendEvent;
  today?: string;
}

export interface DividendMatchResult {
  upsert: UpsertPortfolioDividendInput | null;
  skipReason?: string;
}

function firstBuyAt(ledger: readonly PortfolioLedgerEntry[]): string | null {
  const buys = ledger.filter((entry) => entry.side !== 'sell').sort((a, b) => a.tradeAt.localeCompare(b.tradeAt));
  return buys[0]?.tradeAt ?? null;
}

export function matchDividendEvent(input: DividendMatchInput): DividendMatchResult {
  const { event, ledger, accountId, symbol, kind } = input;
  const today = input.today ?? new Date().toISOString().slice(0, 10);

  if (event.status !== 'implemented') {
    return { upsert: null, skipReason: 'not_implemented' };
  }
  if (!event.exDividendDate) {
    return { upsert: null, skipReason: 'no_ex_date' };
  }
  if (event.cashPerShare === null || event.cashPerShare <= 0) {
    return { upsert: null, skipReason: 'no_cash_per_share' };
  }

  const openedAt = firstBuyAt(ledger);
  if (!openedAt || openedAt.slice(0, 10) >= event.exDividendDate) {
    return { upsert: null, skipReason: 'opened_after_ex' };
  }

  const recordDate = event.recordDate ?? recordDateFromExDate(event.exDividendDate);
  const eligibleQuantity = snapshotQuantityAt(ledger, recordDate);
  if (eligibleQuantity <= 0) {
    return { upsert: null, skipReason: 'zero_eligible_qty' };
  }

  const cashAmount = event.cashPerShare * eligibleQuantity;
  const autoConfirmCutoff = shiftDate(event.exDividendDate, 3);
  const status = today >= autoConfirmCutoff ? 'confirmed' : 'estimated';

  const externalEventKey = [
    event.exDividendDate,
    event.cashPerShare.toFixed(4),
    event.planText.slice(0, 32),
  ].join('|');

  return {
    upsert: {
      accountId,
      symbol,
      kind,
      exDividendDate: event.exDividendDate,
      recordDate: event.recordDate,
      payDate: event.payDate,
      cashPerShare: event.cashPerShare,
      eligibleQuantity,
      cashAmount,
      status,
      source: 'api',
      externalEventKey,
    },
  };
}

function shiftDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function buildProjectedDividends(
  holdings: ReadonlyMap<string, { quantity: number; kind: PortfolioLedgerEntry['kind']; name: string }>,
  events: readonly DividendEvent[],
  today = new Date().toISOString().slice(0, 10),
): Array<{ date: string; symbol: string; name: string; kind: PortfolioLedgerEntry['kind']; cashAmount: number }> {
  const projected: Array<{ date: string; symbol: string; name: string; kind: PortfolioLedgerEntry['kind']; cashAmount: number }> =
    [];

  for (const event of events) {
    if (event.status !== 'announced' && event.status !== 'proposed') continue;
    if (!event.exDividendDate || event.exDividendDate <= today) continue;
    if (event.cashPerShare === null || event.cashPerShare <= 0) continue;
    const holding = holdings.get(event.symbol);
    if (!holding || holding.quantity <= 0) continue;
    projected.push({
      date: event.exDividendDate,
      symbol: event.symbol,
      name: holding.name,
      kind: holding.kind,
      cashAmount: event.cashPerShare * holding.quantity,
    });
  }

  return projected;
}
