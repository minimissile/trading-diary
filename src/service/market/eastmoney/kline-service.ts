import type { KLineAdjust, KLineBar, KLineListResult, KLinePeriod } from '../../../shared/market/types';
import { MarketNotFoundError } from '../../../shared/market/errors';
import { eastMoneyFetchJson } from './client';
import { resolveInstrument } from './search-service';
import { toSecid } from './symbols';

interface KLineResponse {
  rc: number;
  data?: {
    code?: string;
    name?: string;
    klines?: string[];
  };
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

/**
 * 拉取标的 K 线序列。
 * @param symbolInput 证券代码
 * @param period K 线周期
 * @param adjust 复权方式
 * @param limit 返回条数上限
 */
export async function listKlines(
  symbolInput: string,
  period: KLinePeriod = '1d',
  adjust: KLineAdjust = 'forward',
  limit = 240,
): Promise<KLineListResult> {
  const instrument = await resolveInstrument(symbolInput);
  if (instrument.kind === 'otc_fund') {
    throw new MarketNotFoundError(`场外基金暂无 K 线：${instrument.symbol}`);
  }

  const secid = instrument.secid ?? toSecid(instrument.symbol);
  if (!secid) throw new MarketNotFoundError(`无法解析 K 线代码：${instrument.symbol}`);

  const url = new URL('https://push2his.eastmoney.com/api/qt/stock/kline/get');
  url.searchParams.set('secid', secid);
  url.searchParams.set('klt', String(PERIOD_TO_KLT[period]));
  url.searchParams.set('fqt', String(ADJUST_TO_FQT[adjust]));
  url.searchParams.set('lmt', String(Math.min(Math.max(limit, 1), 1023)));
  url.searchParams.set('end', '20500000');
  url.searchParams.set('fields1', 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13');
  url.searchParams.set('fields2', 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61');

  const payload = await eastMoneyFetchJson<KLineResponse>(url, { referer: 'https://quote.eastmoney.com/' });
  if (payload.rc !== 0 || !payload.data?.klines?.length) {
    throw new MarketNotFoundError(`K 线为空：${instrument.symbol}`);
  }

  const bars = payload.data.klines
    .map(parseKLineRow)
    .filter((bar): bar is KLineBar => bar !== null)
    .sort((left, right) => left.timestamp - right.timestamp);

  return {
    symbol: payload.data.code ?? instrument.symbol,
    name: payload.data.name ?? instrument.name,
    period,
    adjust,
    bars,
  };
}

function parseKLineRow(row: string): KLineBar | null {
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
