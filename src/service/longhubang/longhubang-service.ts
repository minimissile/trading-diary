import type {
  LhbDetail,
  LhbDetailInput,
  LhbEvent,
  LhbFreshness,
  LhbQueryInput,
  LhbQueryResult,
  LhbStatus,
  LhbStockSummary,
  LhbInstitution,
} from '../../shared/longhubang/types';
import { LHB_NUMERIC_FILTERS, lhbRangeKeys, type LhbNumericField } from '../../shared/longhubang/filters';
import { lhbDetailSchema, lhbQuerySchema } from '../../shared/schemas/requests/longhubang.requests';
import { EastMoneyLonghubangProvider, type LhbProvider } from '../market/eastmoney/longhubang-provider';
import type { LhbCache, LhbCacheEntry } from './longhubang-database';

type Cached<T> = { data: T } & LhbFreshness;
const MINUTE = 60_000;
const DAY = 86_400_000;

function matchesRange(value: number | null, min?: number, max?: number): boolean {
  if (min === undefined && max === undefined) return true;
  return value !== null && (min === undefined || value >= min) && (max === undefined || value <= max);
}

const securityKey = (event: LhbEvent) => `${event.exchange}:${event.symbol}`;
const institutionKey = (event: Pick<LhbEvent, 'exchange' | 'symbol' | 'date' | 'reason'>) =>
  `${event.exchange}:${event.symbol}:${event.date}:${event.reason}`;

export function joinLhbInstitutions(events: LhbEvent[], institutions: LhbInstitution[]): LhbEvent[] {
  const byReason = new Map(institutions.map((row) => [institutionKey(row), row]));
  if (byReason.size !== institutions.length) throw new Error('机构统计出现重复原因，暂不能可靠关联');
  return events.map((event) => {
    const row = byReason.get(institutionKey(event));
    return { ...event, ...row, hasInstitution: row !== undefined };
  });
}

function compareEvents(a: LhbEvent, b: LhbEvent, input: LhbQueryInput): number {
  const direction = input.order === 'asc' ? 1 : -1;
  const sort = input.sort ?? 'date';
  const aliases = {
    net: 'netCents',
    buy: 'buyCents',
    sell: 'sellCents',
    change: 'changePercent',
    turnover: 'turnoverPercent',
  } as const;
  let compared = 0;
  if (sort === 'date' || sort === 'appearances') compared = a.date.localeCompare(b.date) * direction;
  else {
    const field: LhbNumericField = sort in aliases ? aliases[sort as keyof typeof aliases] : (sort as LhbNumericField);
    const left = a[field],
      right = b[field];
    if (left == null && right != null) return 1;
    if (right == null && left != null) return -1;
    if (left != null && right != null) compared = (left - right) * direction;
  }
  return compared || b.date.localeCompare(a.date) || a.symbol.localeCompare(b.symbol) || a.id.localeCompare(b.id);
}

/** 所有事件条件在完整范围生效，上榜次数在筛选后按标的统计，同日可去重。 */
export function filterLhbEvents(events: readonly LhbEvent[], input: LhbQueryInput): LhbEvent[] {
  const keyword = input.keyword?.trim().toLowerCase();
  return events
    .filter(
      (event) =>
        (!keyword || `${event.name} ${event.symbol}`.toLowerCase().includes(keyword)) &&
        (!input.exchange || event.exchange === input.exchange) &&
        (!input.board || event.board === input.board) &&
        (!input.period || event.period === input.period) &&
        (!input.reason?.trim() || event.reason.includes(input.reason.trim())) &&
        (!input.reasonCode || event.reasonCode === input.reasonCode) &&
        (!input.interpretation?.trim() || event.interpretation.includes(input.interpretation.trim())) &&
        (input.hasInstitution === undefined || event.hasInstitution === input.hasInstitution) &&
        LHB_NUMERIC_FILTERS.every(({ field }) => {
          const [min, max] = lhbRangeKeys(field);
          return matchesRange(event[field], input[min], input[max]);
        }),
    )
    .sort((a, b) => compareEvents(a, b, input));
}

export function summarizeLhbStocks(events: LhbEvent[], input: LhbQueryInput): LhbStockSummary[] {
  const groups = new Map<string, { summary: LhbStockSummary; dates: Set<string> }>();
  for (const event of events) {
    const key = securityKey(event);
    let group = groups.get(key);
    if (!group) {
      group = {
        summary: {
          key,
          latestEvent: event,
          appearances: 0,
          eventCount: 0,
          tradingDays: 0,
          firstDate: event.date,
          lastDate: event.date,
        },
        dates: new Set(),
      };
      groups.set(key, group);
    }
    const row = group.summary;
    row.eventCount++;
    group.dates.add(event.date);
    if (event.date < row.firstDate) row.firstDate = event.date;
    if (event.date > row.lastDate || (event.date === row.lastDate && event.id < row.latestEvent.id)) {
      row.lastDate = event.date;
      row.latestEvent = event;
    }
  }
  return [...groups.values()]
    .map(({ summary, dates }) => ({
      ...summary,
      tradingDays: dates.size,
      appearances: input.countMode === 'events' ? summary.eventCount : dates.size,
    }))
    .filter((row) => matchesRange(row.appearances, input.minAppearances, input.maxAppearances))
    .sort((a, b) => {
      if (!input.sort || input.sort === 'appearances')
        return (
          (a.appearances - b.appearances) * (input.order === 'asc' ? 1 : -1) ||
          b.lastDate.localeCompare(a.lastDate) ||
          a.key.localeCompare(b.key)
        );
      return compareEvents(a.latestEvent, b.latestEvent, input);
    });
}

export class LonghubangService {
  private readonly pending = new Map<string, Promise<Cached<unknown>>>();

  constructor(
    private readonly cache: LhbCache,
    private readonly provider: LhbProvider = new EastMoneyLonghubangProvider(),
    private readonly now: () => number = Date.now,
  ) {}

  private cached<T>(
    key: string,
    refresh: boolean | undefined,
    load: () => Promise<T>,
    ttl: (data: T) => number,
  ): Promise<Cached<T>> {
    const pending = this.pending.get(key);
    if (pending) return pending as Promise<Cached<T>>;
    const old = this.cache.read<T>(key);
    const wrap = (entry: LhbCacheEntry<T>, stale = false, warning: string | null = null): Cached<T> => ({
      data: entry.data,
      source: 'eastmoney',
      fetchedAt: entry.fetchedAt,
      stale,
      warning,
    });
    if (old && !refresh && Date.parse(old.expiresAt) > this.now()) return Promise.resolve(wrap(old));
    const promise = (async () => {
      try {
        const data = await load();
        const time = this.now();
        const entry = { data, fetchedAt: new Date(time).toISOString(), expiresAt: new Date(time + ttl(data)).toISOString() };
        this.cache.write(key, entry);
        return wrap(entry);
      } catch (error) {
        if (!old) throw error;
        const message = error instanceof Error ? error.message : '数据源暂时不可用';
        return wrap(old, true, `更新失败，正在显示缓存：${message}`);
      } finally {
        this.pending.delete(key);
      }
    })();
    this.pending.set(key, promise);
    return promise;
  }

  async getStatus(refresh?: boolean): Promise<LhbStatus> {
    const { data, ...freshness } = await this.cached(
      'status',
      refresh,
      () => this.provider.latestDate(),
      () => 15 * MINUTE,
    );
    return { latestDate: data, ...freshness };
  }

  async query(raw: LhbQueryInput): Promise<LhbQueryResult> {
    const input = lhbQuerySchema.parse(raw);
    const { startDate, endDate, symbol } = input;
    const securityType = input.securityType ?? 'stock';
    const withInstitution =
      input.includeInstitution ||
      input.hasInstitution !== undefined ||
      input.sort?.startsWith('institution') ||
      LHB_NUMERIC_FILTERS.some(({ field, group }) => {
        const [min, max] = lhbRangeKeys(field);
        return group === '机构' && (input[min] !== undefined || input[max] !== undefined);
      });
    const { data, ...freshness } = await this.cached(
      `events:${startDate}:${endDate}:${symbol ?? 'all'}:${securityType}:${withInstitution ? 'org' : 'base'}`,
      input.refresh,
      async () => {
        if (!withInstitution) return this.provider.list(startDate, endDate, symbol, securityType);
        const [events, institutions] = await Promise.all([
          this.provider.list(startDate, endDate, symbol, securityType),
          this.provider.institutions(startDate, endDate, symbol),
        ]);
        return joinLhbInstitutions(events, institutions);
      },
      (events) => (!events.length ? 5 * MINUTE : this.now() - Date.parse(endDate) > 7 * DAY ? 30 * DAY : 15 * MINUTE),
    );
    const matching = filterLhbEvents(data, input);
    const stocks = summarizeLhbStocks(matching, input);
    const keys = new Set(stocks.map((row) => row.key));
    const filtered = matching.filter((event) => keys.has(securityKey(event)));
    if (input.sort === 'appearances') {
      const positions = new Map(stocks.map((row, index) => [row.key, index]));
      filtered.sort(
        (a, b) =>
          positions.get(securityKey(a))! - positions.get(securityKey(b))! ||
          b.date.localeCompare(a.date) ||
          a.id.localeCompare(b.id),
      );
    }
    const total = input.view === 'stocks' ? stocks.length : filtered.length;
    const pageSize = input.pageSize ?? 20;
    const page = Math.min(input.page ?? 1, Math.max(1, Math.ceil(total / pageSize)));
    return {
      ...freshness,
      items: filtered.slice((page - 1) * pageSize, page * pageSize),
      stocks: stocks.slice((page - 1) * pageSize, page * pageSize),
      total,
      facets: {
        boards: [...new Set(data.map((row) => row.board).filter(Boolean))].sort(),
        reasons: [...new Map(data.map((row) => [row.reasonCode, { code: row.reasonCode, text: row.reason }])).values()],
      },
      page,
      pageSize,
      summary: {
        securities: new Set(filtered.map((event) => `${event.exchange}:${event.symbol}`)).size,
        tradingDays: new Set(filtered.map((event) => event.date)).size,
      },
      coverage: { startDate, endDate, complete: true },
    };
  }

  async getDetail(raw: LhbDetailInput): Promise<LhbDetail> {
    const { symbol, date, refresh } = lhbDetailSchema.parse(raw);
    const { data, ...freshness } = await this.cached(
      `detail:${symbol}:${date}`,
      refresh,
      async () => {
        const [events, seats] = await Promise.all([
          this.provider.list(date, date, symbol, 'all'),
          this.provider.seats(symbol, date),
        ]);
        return { events, seats };
      },
      (result) => (!result.events.length ? 5 * MINUTE : this.now() - Date.parse(date) > 7 * DAY ? 30 * DAY : 15 * MINUTE),
    );
    return { symbol, date, ...data, ...freshness };
  }
}
