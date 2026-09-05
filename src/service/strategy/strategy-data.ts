import type { StrategyBar, StrategySeries } from '../../shared/strategy/types';

type TencentBucket = { day?: unknown; qfqday?: unknown; qt?: Record<string, unknown> };
export type StrategyFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

function rowsToMap(rows: unknown): Map<string, number[]> {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('日线为空');
  const output = new Map<string, number[]>();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 6 || !/^\d{4}-\d{2}-\d{2}$/u.test(String(row[0]))) throw new Error('日线格式无效');
    const values = row.slice(1, 6).map(Number);
    const [open, close, high, low, volume] = values as [number, number, number, number, number];
    if (
      !values.every(Number.isFinite) ||
      Math.min(open, close, high, low) <= 0 ||
      volume < 0 ||
      high < Math.max(open, close) ||
      low > Math.min(open, close)
    ) {
      throw new Error(`日线价格异常：${String(row[0])}`);
    }
    if (output.has(String(row[0]))) throw new Error('日线包含重复日期');
    output.set(String(row[0]), values);
  }
  return output;
}

export function parseStrategySeries(key: string, raw: TencentBucket, adjusted: TencentBucket): StrategySeries {
  const rawBars = rowsToMap(raw.day);
  // Never silently substitute unadjusted data for a requested adjusted series.
  const adjustedBars = rowsToMap(adjusted.qfqday);
  const quote = raw.qt?.[key];
  const name = Array.isArray(quote) && typeof quote[1] === 'string' ? quote[1] : key.slice(2);
  const bars: StrategyBar[] = [];
  for (const [date, values] of rawBars) {
    const match = adjustedBars.get(date);
    if (!match) throw new Error(`复权与原始日线不对齐：${date}`);
    bars.push({
      date,
      open: match[0]!,
      close: match[1]!,
      high: match[2]!,
      low: match[3]!,
      volume: values[4]!,
      rawOpen: values[0]!,
      rawClose: values[1]!,
    });
  }
  return { symbol: key.slice(2), name, bars: bars.sort((a, b) => a.date.localeCompare(b.date)) };
}

export class StrategyDataProvider {
  private readonly cache = new Map<string, { time: number; series: StrategySeries }>();
  constructor(private readonly request: StrategyFetch = fetch) {}

  private async fetchBucket(key: string, endDate: string, adjust: '' | 'qfq'): Promise<TencentBucket> {
    const url = new URL('https://web.ifzq.gtimg.cn/appstock/app/fqkline/get');
    url.searchParams.set('param', `${key},day,,${endDate},640,${adjust}`);
    const response = await this.request(url, {
      signal: AbortSignal.timeout(12_000),
      headers: {
        Referer: 'https://gu.qq.com/',
        'User-Agent': 'Mozilla/5.0',
        Accept: 'application/json',
      },
    });
    if (!response.ok) throw new Error(`日线服务 HTTP ${response.status}`);
    const payload = (await response.json()) as { code?: number; data?: Record<string, TencentBucket> };
    const bucket = payload.data?.[key];
    if (payload.code !== 0 || !bucket) throw new Error('日线服务未返回该标的数据');
    return bucket;
  }

  async load(symbol: string, endDate: string, refresh = false, benchmark = false): Promise<StrategySeries> {
    const key = benchmark ? 'sh000300' : `${symbol.startsWith('6') ? 'sh' : 'sz'}${symbol}`;
    const cacheKey = `${key}:${endDate}`;
    const cached = this.cache.get(cacheKey);
    if (!refresh && cached && Date.now() - cached.time < 15 * 60_000) return cached.series;
    let result: StrategySeries;
    if (benchmark) {
      const raw = await this.fetchBucket(key, endDate, '');
      result = parseStrategySeries(key, raw, { qfqday: raw.day });
    } else {
      const [raw, adjusted] = await Promise.all([this.fetchBucket(key, endDate, ''), this.fetchBucket(key, endDate, 'qfq')]);
      result = parseStrategySeries(key, raw, adjusted);
    }
    result.bars = result.bars.filter((bar) => bar.date <= endDate);
    if (result.bars.length === 0) throw new Error('指定日期前无日线，请调整日期');
    this.cache.set(cacheKey, { time: Date.now(), series: result });
    if (this.cache.size > 140) this.cache.delete(this.cache.keys().next().value!);
    return result;
  }
}
