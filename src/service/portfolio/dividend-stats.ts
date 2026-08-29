import { computeMilestoneStates, countLitMilestones } from '../../shared/portfolio/dividend-milestones';
import type {
  DividendCalendarDay,
  PortfolioDividendRecord,
  PortfolioSummaryView,
} from '../../shared/portfolio/types';
import type { DividendEvent } from '../../shared/market/types';
import { daysElapsedInYear } from './ledger-service';

export function filterYtdConfirmed(
  records: readonly PortfolioDividendRecord[],
  year: number,
): PortfolioDividendRecord[] {
  return records.filter(
    (record) => record.status === 'confirmed' && record.exDividendDate.startsWith(String(year)),
  );
}

export function sumCashAmount(records: readonly PortfolioDividendRecord[]): number {
  return records.reduce((total, record) => total + record.cashAmount, 0);
}

export function computeYtdReceived(records: readonly PortfolioDividendRecord[], year: number): number {
  return sumCashAmount(filterYtdConfirmed(records, year));
}

export function computeDailyAverage(ytdReceived: number, year: number, now = new Date()): number {
  return ytdReceived / daysElapsedInYear(year, now);
}

export function computeExpectedFromEvents(
  holdings: ReadonlyMap<string, number>,
  events: readonly DividendEvent[],
  today = new Date().toISOString().slice(0, 10),
): number {
  let total = 0;
  for (const event of events) {
    if (event.status !== 'announced' && event.status !== 'proposed') continue;
    if (!event.exDividendDate || event.exDividendDate <= today) continue;
    if (event.cashPerShare === null || event.cashPerShare <= 0) continue;
    const qty = holdings.get(event.symbol) ?? 0;
    if (qty <= 0) continue;
    total += event.cashPerShare * qty;
  }
  return total;
}

export function buildPortfolioSummary(input: {
  year: number;
  records: readonly PortfolioDividendRecord[];
  expectedDividend: number;
  totalMarketValue: number;
  totalCost: number;
  dailyPnl: number;
  unrealizedPnl: number;
  lastRefreshedAt: string | null;
  now?: Date;
}): PortfolioSummaryView {
  const ytdReceived = computeYtdReceived(input.records, input.year);
  return {
    year: input.year,
    ytdReceived,
    expectedDividend: input.expectedDividend,
    dailyAverage: computeDailyAverage(ytdReceived, input.year, input.now),
    totalMarketValue: input.totalMarketValue,
    totalCost: input.totalCost,
    unrealizedPnl: input.unrealizedPnl,
    dailyPnl: input.dailyPnl,
    milestones: computeMilestoneStates(ytdReceived),
    litMilestoneCount: countLitMilestones(ytdReceived),
    lastRefreshedAt: input.lastRefreshedAt,
  };
}

export function buildDividendCalendar(
  records: readonly PortfolioDividendRecord[],
  month: string,
  projected: readonly { date: string; symbol: string; name: string; kind: PortfolioDividendRecord['kind']; cashAmount: number }[],
): DividendCalendarDay[] {
  const prefix = month.slice(0, 7);
  const dayMap = new Map<string, DividendCalendarDay['items']>();

  const push = (date: string, item: DividendCalendarDay['items'][number]): void => {
    if (!date.startsWith(prefix)) return;
    const list = dayMap.get(date) ?? [];
    list.push(item);
    dayMap.set(date, list);
  };

  for (const record of records) {
    if (record.status === 'rejected') continue;
    push(record.exDividendDate, {
      accountId: record.accountId,
      symbol: record.symbol,
      name: record.name,
      kind: record.kind,
      cashAmount: record.cashAmount,
      status: record.status === 'confirmed' ? 'confirmed' : 'expected',
    });
  }

  for (const item of projected) {
    push(item.date, {
      symbol: item.symbol,
      name: item.name,
      kind: item.kind,
      cashAmount: item.cashAmount,
      status: 'projected',
    });
  }

  return [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({ date, items }));
}
