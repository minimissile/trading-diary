import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import type { KLineBar } from '../../shared/market/types';
import type { InstrumentKind } from '../../shared/market/types';
import {
  DAILY_BAR_INCREMENTAL_LIMIT,
  DAILY_BAR_SYNC_MIN_INTERVAL_MS,
  DAILY_BAR_SYNC_REQUEST_DELAY_MS,
  PNL_CALENDAR_MAX_BARS,
  pnlCalendarWindowEnd,
  pnlCalendarWindowStart,
} from '../../shared/portfolio/pnl-calendar-window';
import { shiftCalendarDate, TRADE_MARKET_TIMEZONE } from '../../shared/trade-calendar';
import type { MarketDailyBarDatabase } from './market-daily-bar-database';
import { marketService } from './market-service';

dayjs.extend(utc);
dayjs.extend(timezone);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function barTradeDate(bar: KLineBar): string {
  return dayjs(bar.timestamp).tz(TRADE_MARKET_TIMEZONE).format('YYYY-MM-DD');
}

function buildDailyBarsFromKlines(bars: readonly KLineBar[]): Array<Omit<import('./market-daily-bar-database').MarketDailyBar, 'symbol' | 'kind'>> {
  const sorted = [...bars].sort((left, right) => left.timestamp - right.timestamp);
  const fetchedAt = new Date().toISOString();
  const output: Array<Omit<import('./market-daily-bar-database').MarketDailyBar, 'symbol' | 'kind'>> = [];

  for (let index = 0; index < sorted.length; index += 1) {
    const bar = sorted[index];
    if (!bar) continue;
    const prev = index > 0 ? sorted[index - 1] : undefined;
    output.push({
      tradeDate: barTradeDate(bar),
      close: bar.close,
      prevClose: prev ? prev.close : null,
      fetchedAt,
    });
  }

  return output;
}

function filterBarsToWindow(
  bars: Array<Omit<import('./market-daily-bar-database').MarketDailyBar, 'symbol' | 'kind'>>,
  windowStart: string,
): Array<Omit<import('./market-daily-bar-database').MarketDailyBar, 'symbol' | 'kind'>> {
  return bars.filter((bar) => bar.tradeDate >= windowStart);
}

export interface DailyBarSyncResult {
  symbol: string;
  synced: boolean;
  skipped: boolean;
  barCount: number;
  error?: string;
}

export class DailyBarSyncService {
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly bars: MarketDailyBarDatabase) {}

  scheduleSymbols(symbols: readonly string[], kinds: ReadonlyMap<string, InstrumentKind>): void {
    const unique = [...new Set(symbols.map((item) => item.trim().toUpperCase()).filter(Boolean))];
    if (unique.length === 0) return;

    this.chain = this.chain.then(async () => {
      for (const symbol of unique) {
        const kind = kinds.get(symbol) ?? 'stock';
        try {
          await this.syncSymbol(symbol, kind);
        } catch {
          // 单个 symbol 失败不阻塞队列
        }
        await sleep(DAILY_BAR_SYNC_REQUEST_DELAY_MS);
      }
    });
  }

  waitForIdle(): Promise<void> {
    return this.chain;
  }

  async syncSymbolsNow(
    symbols: readonly string[],
    kinds: ReadonlyMap<string, InstrumentKind>,
  ): Promise<DailyBarSyncResult[]> {
    const unique = [...new Set(symbols.map((item) => item.trim().toUpperCase()).filter(Boolean))];
    const sorted = unique.sort((left, right) => {
      const leftCached = this.bars.getSyncMeta(left) ? 1 : 0;
      const rightCached = this.bars.getSyncMeta(right) ? 1 : 0;
      return leftCached - rightCached;
    });
    const results: DailyBarSyncResult[] = [];

    for (const symbol of sorted) {
      const kind = kinds.get(symbol) ?? 'stock';
      try {
        results.push(await this.syncSymbol(symbol, kind));
      } catch (error) {
        results.push({
          symbol,
          synced: false,
          skipped: false,
          barCount: this.bars.countBars(symbol),
          error: error instanceof Error ? error.message : '同步失败',
        });
      }
      await sleep(DAILY_BAR_SYNC_REQUEST_DELAY_MS);
    }

    return results;
  }

  async syncSymbol(symbol: string, kindHint?: InstrumentKind): Promise<DailyBarSyncResult> {
    const normalized = symbol.trim().toUpperCase();
    const windowStart = pnlCalendarWindowStart();
    const windowEnd = pnlCalendarWindowEnd();
    const yesterday = shiftCalendarDate(windowEnd, -1);
    const meta = this.bars.getSyncMeta(normalized);
    const now = Date.now();

    if (
      meta &&
      now - Date.parse(meta.lastSyncedAt) < DAILY_BAR_SYNC_MIN_INTERVAL_MS &&
      meta.latestDate >= yesterday
    ) {
      return {
        symbol: normalized,
        synced: false,
        skipped: true,
        barCount: meta.barCount,
      };
    }

    let kind = kindHint ?? meta?.kind ?? 'stock';
    let bars: KLineBar[] = [];
    const useIncremental =
      meta !== null &&
      now - Date.parse(meta.lastSyncedAt) < DAILY_BAR_SYNC_MIN_INTERVAL_MS &&
      meta.latestDate < yesterday;

    if (useIncremental) {
      const incremental = await marketService.listKlines(normalized, '1d', 'none', DAILY_BAR_INCREMENTAL_LIMIT);
      kind = incremental.kind;
      bars = incremental.bars;
    } else {
      const full = await marketService.listKlines(normalized, '1d', 'none', PNL_CALENDAR_MAX_BARS);
      kind = full.kind;
      bars = full.bars;
    }

    const mapped = filterBarsToWindow(buildDailyBarsFromKlines(bars), windowStart);
    if (mapped.length > 0) {
      this.bars.upsertBars(normalized, kind, mapped);
    }

    this.bars.purgeBarsBefore(normalized, windowStart);

    const count = this.bars.countBars(normalized);
    const stored = this.bars.listBarsForSymbols([normalized], windowStart, '9999-12-31');
    const earliestDate = stored[0]?.tradeDate ?? mapped[0]?.tradeDate ?? windowStart;
    const latestDate = stored[stored.length - 1]?.tradeDate ?? mapped[mapped.length - 1]?.tradeDate ?? earliestDate;

    this.bars.upsertSyncMeta({
      symbol: normalized,
      kind,
      earliestDate,
      latestDate,
      lastSyncedAt: new Date().toISOString(),
      barCount: count,
    });

    return {
      symbol: normalized,
      synced: true,
      skipped: false,
      barCount: count,
    };
  }
}

export function createDailyBarSyncService(bars: MarketDailyBarDatabase): DailyBarSyncService {
  return new DailyBarSyncService(bars);
}
