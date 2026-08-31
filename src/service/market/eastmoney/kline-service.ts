import type { KLineAdjust, KLineBar, KLineListResult, KLinePeriod } from '../../../shared/market/types';
import { MarketNotFoundError, MarketProviderError } from '../../../shared/market/errors';
import { canUseKlineFallback, listKlinesFromFallback } from '../kline-fallback-service';
import { formatEastMoneyKLineEnd, sliceKLineBars } from '../kline-utils';
import { eastMoneyFetchJson } from './client';
import { EASTMONEY_KLINE_ORIGINS, EASTMONEY_QUOTE_REFERER, eastMoneyKlineUrl } from './endpoints';
import { eastMoneyFetchText, parseEastMoneyJsonp } from './client';
import { resolveInstrument } from './search-service';
import { toSecid } from './symbols';

export { formatEastMoneyKLineEnd, sliceKLineBars } from '../kline-utils';

interface KLineResponse {
  rc: number;
  data?: {
    code?: string;
    name?: string;
    klines?: string[];
  };
}

interface FundNavRow {
  FSRQ: string;
  DWJZ: string;
}

interface FundNavResponse {
  Data?: {
    LSJZList?: FundNavRow[];
  } | null;
}

const PERIOD_TO_KLT: Record<KLinePeriod, number> = {
  '1m': 1,
  '5m': 5,
  '15m': 15,
  '30m': 30,
  '60m': 60,
  '1d': 101,
  '1w': 102,
  '1M': 103,
};

const ADJUST_TO_FQT: Record<KLineAdjust, number> = {
  none: 0,
  forward: 1,
  backward: 2,
};

const FUND_NAV_PAGE_SIZE = 20;
const FUND_NAV_MAX_PAGES = 160;
const DEFAULT_KLINE_LIMIT = 240;
const KLINE_ORIGIN_BATCH_SIZE = 15;

interface KLineSearchParams {
  secid: string;
  klt: string;
  fqt: string;
  lmt: string;
  end: string;
  fields1: string;
  fields2: string;
}

/**
 * 拉取标的 K 线序列。
 * @param beforeTimestamp 仅返回早于该时间戳的 K 线（用于图表向左加载历史）
 */
export async function listKlines(
  symbolInput: string,
  period: KLinePeriod = '1d',
  adjust: KLineAdjust = 'forward',
  limit = DEFAULT_KLINE_LIMIT,
  beforeTimestamp?: number,
): Promise<KLineListResult> {
  const instrument = await resolveInstrument(symbolInput);
  const clampedLimit = Math.min(Math.max(limit, 1), 1023);

  if (instrument.kind === 'otc_fund') {
    const { bars, hasMoreHistory } = await listOtcFundNavBars(instrument.symbol, clampedLimit, beforeTimestamp);
    return {
      symbol: instrument.symbol,
      name: instrument.name,
      kind: instrument.kind,
      period: '1d',
      adjust: 'none',
      bars,
      hasMoreHistory,
    };
  }

  const secid = instrument.secid ?? toSecid(instrument.symbol);
  if (!secid) throw new MarketNotFoundError(`无法解析 K 线代码：${instrument.symbol}`);

  const searchParams: KLineSearchParams = {
    secid,
    klt: String(PERIOD_TO_KLT[period]),
    fqt: String(ADJUST_TO_FQT[adjust]),
    lmt: String(clampedLimit),
    end: formatEastMoneyKLineEnd(beforeTimestamp, period),
    fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
  };

  try {
    const payload = await fetchEastMoneyKlinePayload(searchParams);
    if (payload.rc !== 0 || !payload.data?.klines?.length) {
      if (beforeTimestamp !== undefined) {
        return {
          symbol: instrument.symbol,
          name: instrument.name,
          kind: instrument.kind,
          period,
          adjust,
          bars: [],
          hasMoreHistory: false,
        };
      }
      throw new MarketNotFoundError(`K 线为空：${instrument.symbol}`);
    }

    const parsed = payload.data.klines
      .map(parseExchangeKLineRow)
      .filter((bar): bar is KLineBar => bar !== null)
      .sort((left, right) => left.timestamp - right.timestamp);

    const sliced = sliceKLineBars(parsed, clampedLimit, beforeTimestamp);
    return {
      symbol: payload.data.code ?? instrument.symbol,
      name: payload.data.name ?? instrument.name,
      kind: instrument.kind,
      period,
      adjust,
      bars: sliced.bars,
      hasMoreHistory: sliced.hasMoreHistory,
    };
  } catch (error) {
    if (canUseKlineFallback(instrument.symbol, period)) {
      return listKlinesFromFallback(
        instrument.symbol,
        instrument.name,
        instrument.kind,
        period,
        adjust,
        clampedLimit,
        beforeTimestamp,
      );
    }

    if (beforeTimestamp !== undefined) {
      return {
        symbol: instrument.symbol,
        name: instrument.name,
        kind: instrument.kind,
        period,
        adjust,
        bars: [],
        hasMoreHistory: false,
      };
    }

    if (error instanceof MarketNotFoundError || error instanceof MarketProviderError) throw error;
    throw new MarketProviderError(error instanceof Error ? error.message : 'K 线加载失败');
  }
}

async function fetchEastMoneyKlinePayload(searchParams: KLineSearchParams): Promise<KLineResponse> {
  for (let offset = 0; offset < EASTMONEY_KLINE_ORIGINS.length; offset += KLINE_ORIGIN_BATCH_SIZE) {
    const batch = EASTMONEY_KLINE_ORIGINS.slice(offset, offset + KLINE_ORIGIN_BATCH_SIZE);
    const attempts = batch.map((origin) =>
      eastMoneyFetchJson<KLineResponse>(eastMoneyKlineUrl(origin, searchParams), {
        referer: EASTMONEY_QUOTE_REFERER,
      }).then((payload) => {
        if (payload.rc !== 0 || !payload.data?.klines?.length) {
          throw new MarketProviderError('东方财富 K 线为空');
        }
        return payload;
      }),
    );

    try {
      return await Promise.any(attempts);
    } catch {
      // 当前批次全部失败，继续下一批 CDN 节点。
    }
  }

  throw new MarketProviderError('东方财富 K 线节点不可达');
}

async function fetchFundNavPage(symbol: string, pageIndex: number): Promise<FundNavRow[]> {
  const url = new URL('https://api.fund.eastmoney.com/f10/lsjz');
  url.searchParams.set('fundCode', symbol);
  url.searchParams.set('pageIndex', String(pageIndex));
  url.searchParams.set('pageSize', String(FUND_NAV_PAGE_SIZE));

  const text = await eastMoneyFetchText(url, {
    referer: `https://fundf10.eastmoney.com/jjgz/${symbol}.html`,
  });
  const trimmed = text.trim();
  const payload = trimmed.startsWith('{')
    ? (JSON.parse(trimmed) as FundNavResponse)
    : parseEastMoneyJsonp<FundNavResponse>(trimmed);
  return payload.Data?.LSJZList ?? [];
}

async function listOtcFundNavBars(
  symbol: string,
  limit: number,
  beforeTimestamp?: number,
): Promise<{ bars: KLineBar[]; hasMoreHistory: boolean }> {
  const rows: FundNavRow[] = [];
  let pageIndex = 1;
  let hasMorePages = true;

  while (pageIndex <= FUND_NAV_MAX_PAGES) {
    const batch = await fetchFundNavPage(symbol, pageIndex);
    if (batch.length === 0) {
      hasMorePages = false;
      break;
    }

    rows.push(...batch);
    pageIndex += 1;

    const bars = buildOtcFundNavBars(rows);
    const sliced = sliceKLineBars(bars, limit, beforeTimestamp);
    if (sliced.bars.length >= limit) {
      return {
        bars: sliced.bars,
        hasMoreHistory: sliced.hasMoreHistory && (hasMorePages || batch.length === FUND_NAV_PAGE_SIZE),
      };
    }
  }

  if (rows.length === 0) {
    throw new MarketNotFoundError(`基金净值历史为空：${symbol}`);
  }

  const bars = buildOtcFundNavBars(rows);
  const sliced = sliceKLineBars(bars, limit, beforeTimestamp);
  if (sliced.bars.length === 0 && beforeTimestamp !== undefined) {
    return { bars: [], hasMoreHistory: false };
  }
  if (sliced.bars.length === 0) {
    throw new MarketNotFoundError(`基金净值历史不可用：${symbol}`);
  }

  return {
    bars: sliced.bars,
    hasMoreHistory: sliced.hasMoreHistory && pageIndex <= FUND_NAV_MAX_PAGES,
  };
}

function buildOtcFundNavBars(rows: FundNavRow[]): KLineBar[] {
  const sorted = [...rows].sort((left, right) => left.FSRQ.localeCompare(right.FSRQ));
  const bars: KLineBar[] = [];

  for (let index = 0; index < sorted.length; index += 1) {
    const row = sorted[index];
    if (!row) continue;
    const close = Number(row.DWJZ);
    const previousRow = index > 0 ? sorted[index - 1] : undefined;
    const previousClose = previousRow ? Number(previousRow.DWJZ) : close;
    const timestamp = parseKLineTimestamp(row.FSRQ);

    if (!Number.isFinite(timestamp) || !Number.isFinite(close)) continue;

    const open = Number.isFinite(previousClose) ? previousClose : close;
    bars.push({
      timestamp,
      open,
      close,
      high: Math.max(open, close),
      low: Math.min(open, close),
      volume: 0,
      turnover: 0,
    });
  }

  return bars;
}

function parseExchangeKLineRow(row: string): KLineBar | null {
  const parts = row.split(',');
  if (parts.length < 7) return null;

  const timestamp = parseKLineTimestamp(parts[0] ?? '');
  const open = Number(parts[1]);
  const close = Number(parts[2]);
  const high = Number(parts[3]);
  const low = Number(parts[4]);
  const volume = Number(parts[5]);
  const turnover = Number(parts[6]);

  if (!Number.isFinite(timestamp) || !Number.isFinite(open) || !Number.isFinite(close)) {
    return null;
  }

  return {
    timestamp,
    open,
    high: Number.isFinite(high) ? high : Math.max(open, close),
    low: Number.isFinite(low) ? low : Math.min(open, close),
    close,
    volume: Number.isFinite(volume) ? volume : 0,
    turnover: Number.isFinite(turnover) ? turnover : 0,
  };
}

function parseKLineTimestamp(raw: string): number {
  const normalized = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) {
    const parts = normalized.split('-');
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return Number.NaN;
    return new Date(year, month - 1, day).getTime();
  }

  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s(\d{2}):(\d{2})$/u);
  if (!match) return Number.NaN;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return Number.NaN;
  return new Date(year, month - 1, day, hour, minute).getTime();
}
