import { quantBarSchema } from '../../shared/quant-research/schemas';
import type { QuantSeries } from '../../shared/quant-research/types';

export interface QuantDataProvider {
  load: (symbol: string, endDate: string, benchmark?: boolean) => Promise<QuantSeries>;
}
type QuantFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export function parseQuantBucket(symbol: string, key: string, bucket: Record<string, unknown>, benchmark = false): QuantSeries {
  const rows = bucket[benchmark ? 'day' : 'qfqday'];
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(benchmark ? '交易日历为空' : '缺少前复权日线');
  const qt = bucket.qt as Record<string, unknown> | undefined;
  const quote = qt?.[key];
  const name = Array.isArray(quote) && typeof quote[1] === 'string' ? quote[1].trim() : '';
  if (!name || name.length > 100) throw new Error('缺少有效证券名称，无法核对 ST / 退市状态');
  const seen = new Set<string>();
  const bars = rows.map((row: unknown) => {
    if (
      !Array.isArray(row) ||
      row.length < 6 ||
      row.slice(0, 6).some((value) => value === null || value === undefined || value === '')
    )
      throw new Error('日线字段不完整');
    const parsed = quantBarSchema.safeParse({
      date: String(row[0]),
      open: Number(row[1]),
      close: Number(row[2]),
      high: Number(row[3]),
      low: Number(row[4]),
      volume: Number(row[5]),
    });
    if (!parsed.success) throw new Error(`日线数据无效：${String(row[0])}`);
    if (seen.has(parsed.data.date)) throw new Error('日线日期重复');
    seen.add(parsed.data.date);
    return parsed.data;
  });
  return { symbol, name, bars: bars.sort((a, b) => a.date.localeCompare(b.date)) };
}

export class TencentQuantDataProvider implements QuantDataProvider {
  constructor(private readonly request: QuantFetch = fetch) {}

  async load(symbol: string, endDate: string, benchmark = false): Promise<QuantSeries> {
    const key = benchmark ? 'sh000300' : `${symbol.startsWith('6') ? 'sh' : 'sz'}${symbol}`;
    const url = new URL('https://web.ifzq.gtimg.cn/appstock/app/fqkline/get');
    url.searchParams.set('param', `${key},day,,${endDate},640,${benchmark ? '' : 'qfq'}`);
    const response = await this.request(url, {
      signal: AbortSignal.timeout(12_000),
      headers: {
        Referer: 'https://gu.qq.com/',
        'User-Agent': 'Mozilla/5.0',
        Accept: 'application/json',
      },
    });
    if (!response.ok) throw new Error(`日线服务 HTTP ${response.status}`);
    const data = (await response.json()) as { code?: number; data?: Record<string, Record<string, unknown>> };
    const bucket = data.data?.[key];
    if (data.code !== 0 || !bucket) throw new Error('数据源未返回该证券日线');
    const series = parseQuantBucket(symbol, key, bucket, benchmark);
    series.bars = series.bars.filter((bar) => bar.date <= endDate);
    if (!series.bars.length) throw new Error('截止日期之前没有日线');
    return series;
  }
}
