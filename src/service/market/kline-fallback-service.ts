import type { InstrumentKind, KLineAdjust, KLineBar, KLineListResult, KLinePeriod } from '../../shared/market/types';
import { MarketProviderError } from '../../shared/market/errors';
import { detectExchangeMarket, normalizeSymbol } from './eastmoney/symbols';
import { klinePeriodStepMs, sliceKLineBars } from './kline-utils';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const TENCENT_KLINE_URL = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get';
const SINA_KLINE_URL = 'https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData';

const TENCENT_PERIOD: Partial<Record<KLinePeriod, string>> = {
  '1d': 'day',
  '1w': 'week',
  '1M': 'month',
};

const SINA_SCALE: Partial<Record<KLinePeriod, number>> = {
  '5m': 5,
  '15m': 15,
  '30m': 30,
  '60m': 60,
  '1d': 240,
};

interface TencentKLineResponse {
  code?: number;
  data?: Record<string, Record<string, unknown>>;
}

interface SinaKLineRow {
  day: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

function toTencentSymbol(symbol: string): string | null {
  const code = normalizeSymbol(symbol);
  const market = detectExchangeMarket(code);
  if (market === 'SH') return `sh${code.toLowerCase()}`;
  if (market === 'SZ') return `sz${code.toLowerCase()}`;
  return null;
}

function toSinaSymbol(symbol: string): string | null {
  const code = normalizeSymbol(symbol);
  const market = detectExchangeMarket(code);
  if (market === 'SH') return `sh${code.toLowerCase()}`;
  if (market === 'SZ') return `sz${code.toLowerCase()}`;
  return null;
}

function tencentPeriodKey(period: KLinePeriod, adjust: KLineAdjust): string | null {
  const base = TENCENT_PERIOD[period];
  if (!base) return null;
  if (adjust === 'forward') return `qfq${base}`;
  if (adjust === 'backward') return `hfq${base}`;
  return base;
}

function tencentAdjustParam(adjust: KLineAdjust): string {
  if (adjust === 'forward') return 'qfq';
  if (adjust === 'backward') return 'hfq';
  return '';
}

function formatTencentEndDate(beforeTimestamp: number | undefined, period: KLinePeriod): string {
  if (beforeTimestamp === undefined) return '';
  const anchor = beforeTimestamp - klinePeriodStepMs(period);
  const date = new Date(anchor);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseBarTimestamp(raw: string): number {
  const normalized = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) {
    const [year, month, day] = normalized.split('-').map(Number);
    if (!year || !month || !day) return Number.NaN;
    return new Date(year, month - 1, day).getTime();
  }

  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s(\d{2}):(\d{2}):(\d{2})$/u);
  if (!match) return Number.NaN;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (![year, month, day, hour, minute, second].every(Number.isFinite)) return Number.NaN;
  return new Date(year, month - 1, day, hour, minute, second).getTime();
}

function parseTencentRows(rows: unknown): KLineBar[] {
  if (!Array.isArray(rows)) return [];

  const bars: KLineBar[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const timestamp = parseBarTimestamp(String(row[0] ?? ''));
    const open = Number(row[1]);
    const close = Number(row[2]);
    const high = Number(row[3]);
    const low = Number(row[4]);
    const volume = Number(row[5]);
    if (!Number.isFinite(timestamp) || !Number.isFinite(open) || !Number.isFinite(close)) continue;

    bars.push({
      timestamp,
      open,
      close,
      high: Number.isFinite(high) ? high : Math.max(open, close),
      low: Number.isFinite(low) ? low : Math.min(open, close),
      volume: Number.isFinite(volume) ? volume : 0,
      turnover: 0,
    });
  }

  return bars.sort((left, right) => left.timestamp - right.timestamp);
}

function parseSinaRows(rows: SinaKLineRow[]): KLineBar[] {
  const bars: KLineBar[] = [];
  for (const row of rows) {
    const timestamp = parseBarTimestamp(row.day);
    const open = Number(row.open);
    const high = Number(row.high);
    const low = Number(row.low);
    const close = Number(row.close);
    const volume = Number(row.volume);
    if (!Number.isFinite(timestamp) || !Number.isFinite(open) || !Number.isFinite(close)) continue;

    bars.push({
      timestamp,
      open,
      close,
      high: Number.isFinite(high) ? high : Math.max(open, close),
      low: Number.isFinite(low) ? low : Math.min(open, close),
      volume: Number.isFinite(volume) ? volume : 0,
      turnover: 0,
    });
  }

  return bars.sort((left, right) => left.timestamp - right.timestamp);
}

async function fetchTencentKlines(
  symbol: string,
  period: KLinePeriod,
  adjust: KLineAdjust,
  limit: number,
  beforeTimestamp?: number,
): Promise<KLineBar[]> {
  const tencentSymbol = toTencentSymbol(symbol);
  const periodKey = TENCENT_PERIOD[period];
  const dataKey = tencentPeriodKey(period, adjust);
  if (!tencentSymbol || !periodKey || !dataKey) {
    throw new MarketProviderError('腾讯 K 线不支持当前周期或标的');
  }

  const endDate = formatTencentEndDate(beforeTimestamp, period);
  const param = `${tencentSymbol},${periodKey},,${endDate},${limit},${tencentAdjustParam(adjust)}`;
  const url = new URL(TENCENT_KLINE_URL);
  url.searchParams.set('param', param);

  let payload: TencentKLineResponse;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Referer: 'https://gu.qq.com/',
        Accept: 'application/json, text/plain, */*',
      },
    });
    if (!response.ok) {
      throw new MarketProviderError(`腾讯 K 线 HTTP ${response.status}`);
    }
    payload = (await response.json()) as TencentKLineResponse;
  } catch (error) {
    if (error instanceof MarketProviderError) throw error;
    const detail = error instanceof Error ? error.message : '网络错误';
    throw new MarketProviderError(`腾讯 K 线请求失败：${detail}`);
  }

  const bucket = payload.data?.[tencentSymbol];
  const rows = bucket?.[dataKey];
  const bars = parseTencentRows(rows);
  if (bars.length === 0) {
    throw new MarketProviderError('腾讯 K 线为空');
  }
  return bars;
}

async function fetchSinaKlines(
  symbol: string,
  period: KLinePeriod,
  limit: number,
  beforeTimestamp?: number,
): Promise<KLineBar[]> {
  const sinaSymbol = toSinaSymbol(symbol);
  const scale = SINA_SCALE[period];
  if (!sinaSymbol || scale === undefined) {
    throw new MarketProviderError('新浪 K 线不支持当前周期或标的');
  }

  const url = new URL(SINA_KLINE_URL);
  url.searchParams.set('symbol', sinaSymbol);
  url.searchParams.set('scale', String(scale));
  url.searchParams.set('ma', 'no');
  url.searchParams.set('datalen', String(Math.min(Math.max(limit, 1), 1023)));

  let rows: SinaKLineRow[];
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Referer: 'https://finance.sina.com.cn/',
        Accept: 'application/json, text/plain, */*',
      },
    });
    if (!response.ok) {
      throw new MarketProviderError(`新浪 K 线 HTTP ${response.status}`);
    }
    rows = (await response.json()) as SinaKLineRow[];
  } catch (error) {
    if (error instanceof MarketProviderError) throw error;
    const detail = error instanceof Error ? error.message : '网络错误';
    throw new MarketProviderError(`新浪 K 线请求失败：${detail}`);
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new MarketProviderError('新浪 K 线为空');
  }

  const bars = parseSinaRows(rows);
  const sliced = sliceKLineBars(bars, limit, beforeTimestamp);
  return sliced.bars;
}

/**
 * 东方财富 K 线不可达时，回退至腾讯/新浪数据源（仅支持 A 股/ETF/LOF）。
 */
export async function listKlinesFromFallback(
  symbol: string,
  name: string,
  kind: InstrumentKind,
  period: KLinePeriod,
  adjust: KLineAdjust,
  limit: number,
  beforeTimestamp?: number,
): Promise<KLineListResult> {
  const clampedLimit = Math.min(Math.max(limit, 1), 1023);
  let bars: KLineBar[];

  if (TENCENT_PERIOD[period]) {
    try {
      bars = await fetchTencentKlines(symbol, period, adjust, clampedLimit, beforeTimestamp);
    } catch (tencentError) {
      if (SINA_SCALE[period] === undefined) throw tencentError;
      bars = await fetchSinaKlines(symbol, period, clampedLimit, beforeTimestamp);
    }
  } else if (SINA_SCALE[period] !== undefined) {
    bars = await fetchSinaKlines(symbol, period, clampedLimit, beforeTimestamp);
  } else {
    throw new MarketProviderError(`暂无可用 K 线数据源：${period}`);
  }

  const sliced = sliceKLineBars(bars, clampedLimit, beforeTimestamp);
  if (sliced.bars.length === 0 && beforeTimestamp !== undefined) {
    return {
      symbol,
      name,
      kind,
      period,
      adjust,
      bars: [],
      hasMoreHistory: false,
    };
  }
  if (sliced.bars.length === 0) {
    throw new MarketProviderError(`K 线为空：${symbol}`);
  }

  return {
    symbol,
    name,
    kind,
    period,
    adjust,
    bars: sliced.bars,
    hasMoreHistory: sliced.hasMoreHistory,
  };
}

export function canUseKlineFallback(symbol: string, period: KLinePeriod): boolean {
  if (!toTencentSymbol(symbol) && !toSinaSymbol(symbol)) return false;
  return Boolean(TENCENT_PERIOD[period] || SINA_SCALE[period] !== undefined);
}
