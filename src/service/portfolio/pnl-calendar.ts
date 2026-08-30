import type { PortfolioDividendRecord, PortfolioLedgerEntry } from '../../shared/portfolio/types';
import {
  datesInMonth,
  isDateInPnlCalendarWindow,
  monthPrefixFromDate,
  pnlCalendarWindowEnd,
  pnlCalendarWindowStart,
} from '../../shared/portfolio/pnl-calendar-window';
import { tradeCalendarDate } from '../../shared/trade-calendar';
import type { MarketDailyBar } from '../market/market-daily-bar-database';
import { computePositionDailyPnl } from './position-daily-pnl';

export interface PnlCalendarDayCore {
  date: string;
  totalPnl: number;
  dividendPnl: number;
  positionPnl: number;
  symbols: string[];
}

export interface PnlCalendarSummary {
  totalPnl: number;
  positiveDays: number;
  negativeDays: number;
  activeDays: number;
  dividendPnl: number;
}

export interface PnlCalendarBuildResult {
  days: PnlCalendarDayCore[];
  summary: PnlCalendarSummary;
  windowStart: string;
  windowEnd: string;
}

export type DailyBarSeries = ReadonlyMap<string, { close: number; prevClose: number | null }>;

export function indexDailyBars(bars: readonly MarketDailyBar[]): Map<string, DailyBarSeries> {
  const bySymbol = new Map<string, DailyBarSeries>();

  for (const bar of bars) {
    const series = bySymbol.get(bar.symbol) ?? new Map<string, { close: number; prevClose: number | null }>();
    series.set(bar.tradeDate, { close: bar.close, prevClose: bar.prevClose });
    bySymbol.set(bar.symbol, series);
  }

  return bySymbol;
}

function calendarDateToAsOf(date: string): Date {
  return new Date(`${date}T15:00:00+08:00`);
}

function resolveFirstBuyAt(entries: readonly PortfolioLedgerEntry[]): string | null {
  let first: string | null = null;
  for (const entry of entries) {
    if (entry.side === 'sell') continue;
    if (first === null || entry.tradeAt < first) first = entry.tradeAt;
  }
  return first;
}

export function computeSymbolDailyPnlForDate(
  entries: readonly PortfolioLedgerEntry[],
  series: DailyBarSeries,
  date: string,
): number | null {
  const bar = series.get(date);
  if (!bar || bar.prevClose === null) return null;

  const dayChange = bar.close - bar.prevClose;
  return computePositionDailyPnl({
    kind: entries[0]?.kind ?? 'stock',
    entries,
    marketPrice: bar.close,
    quote: {
      price: bar.close,
      prevClose: bar.prevClose,
      change: dayChange,
      changePercent: bar.prevClose !== 0 ? (dayChange / bar.prevClose) * 100 : null,
    },
    asOf: calendarDateToAsOf(date),
    firstBuyAt: resolveFirstBuyAt(entries),
    referenceUnrealizedPnl: null,
  });
}

function aggregateDividendsByDate(
  dividends: readonly PortfolioDividendRecord[],
  windowStart: string,
  windowEnd: string,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const record of dividends) {
    if (record.status === 'rejected') continue;
    const date = record.exDividendDate;
    if (date < windowStart || date > windowEnd) continue;
    map.set(date, (map.get(date) ?? 0) + record.cashAmount);
  }
  return map;
}

function symbolActiveDates(
  entries: readonly PortfolioLedgerEntry[],
  series: DailyBarSeries,
  windowStart: string,
  windowEnd: string,
): string[] {
  if (entries.length === 0) return [];
  const firstTradeDay = entries.reduce((min, entry) => {
    const day = entry.tradeAt.slice(0, 10);
    return day < min ? day : min;
  }, entries[0]!.tradeAt.slice(0, 10));

  return [...series.keys()]
    .filter((date) => date >= windowStart && date <= windowEnd && date >= firstTradeDay)
    .sort();
}

export function buildPnlCalendar(input: {
  ledger: readonly PortfolioLedgerEntry[];
  dividends: readonly PortfolioDividendRecord[];
  barsBySymbol: Map<string, DailyBarSeries>;
  month: string;
  asOf?: Date;
}): PnlCalendarBuildResult {
  const windowStart = pnlCalendarWindowStart(input.asOf);
  const windowEnd = pnlCalendarWindowEnd(input.asOf);
  const dayMap = new Map<string, PnlCalendarDayCore>();
  const dividendMap = aggregateDividendsByDate(input.dividends, windowStart, windowEnd);

  const entriesBySymbol = new Map<string, PortfolioLedgerEntry[]>();
  for (const entry of input.ledger) {
    const list = entriesBySymbol.get(entry.symbol) ?? [];
    list.push(entry);
    entriesBySymbol.set(entry.symbol, list);
  }

  for (const [symbol, entries] of entriesBySymbol) {
    const series = input.barsBySymbol.get(symbol);
    if (!series) continue;

    for (const date of symbolActiveDates(entries, series, windowStart, windowEnd)) {
      if (!isDateInPnlCalendarWindow(date, input.asOf)) continue;
      const positionPnl = computeSymbolDailyPnlForDate(entries, series, date);
      if (positionPnl === null || Math.abs(positionPnl) < 1e-8) continue;

      const existing = dayMap.get(date) ?? {
        date,
        totalPnl: 0,
        dividendPnl: 0,
        positionPnl: 0,
        symbols: [],
      };
      existing.positionPnl += positionPnl;
      existing.totalPnl += positionPnl;
      if (!existing.symbols.includes(symbol)) existing.symbols.push(symbol);
      dayMap.set(date, existing);
    }
  }

  for (const [date, dividendPnl] of dividendMap) {
    if (!isDateInPnlCalendarWindow(date, input.asOf)) continue;
    const existing = dayMap.get(date) ?? {
      date,
      totalPnl: 0,
      dividendPnl: 0,
      positionPnl: 0,
      symbols: [],
    };
    existing.dividendPnl += dividendPnl;
    existing.totalPnl += dividendPnl;
    dayMap.set(date, existing);
  }

  const monthDays = datesInMonth(input.month).filter((date) => date >= windowStart && date <= windowEnd);
  const days = monthDays.map((date) => {
    return (
      dayMap.get(date) ?? {
        date,
        totalPnl: 0,
        dividendPnl: 0,
        positionPnl: 0,
        symbols: [],
      }
    );
  });

  let totalPnl = 0;
  let positiveDays = 0;
  let negativeDays = 0;
  let activeDays = 0;
  let dividendPnl = 0;

  for (const day of dayMap.values()) {
    if (monthPrefixFromDate(day.date) !== input.month) continue;
    totalPnl += day.totalPnl;
    dividendPnl += day.dividendPnl;
    if (Math.abs(day.totalPnl) < 1e-8) continue;
    activeDays += 1;
    if (day.totalPnl > 0) positiveDays += 1;
    else negativeDays += 1;
  }

  return {
    days,
    summary: {
      totalPnl,
      positiveDays,
      negativeDays,
      activeDays,
      dividendPnl,
    },
    windowStart,
    windowEnd,
  };
}
