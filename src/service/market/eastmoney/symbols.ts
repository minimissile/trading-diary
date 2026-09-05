import type { DividendEventStatus } from '../../../shared/market/types';
import type { InstrumentKind } from '../../../shared/market/types';
import type { InstrumentVenue } from '../../../shared/market/venues';

export type ExchangeMarket = 'SH' | 'SZ';

/** EastMoney codetable / push API 市场编号。 */
export const EASTMONEY_MARKET_HK = 116;
export const EASTMONEY_MARKET_US = 105;

const SH_CODE = /^(60[0-9]|68[0-9]|51[0-9]|56[0-9]|58[0-9]|90[0-9])\d{3}$/u;
const SZ_CODE = /^(00[0-9]|30[0-9]|15[0-9]|16[0-9]|20[0-9])\d{3}$/u;
const ETF_CODE = /^(51[0-9]|56[0-9]|58[0-9]|15[0-9])\d{3}$/u;
const LOF_CODE = /^16[0-9]\d{3}$/u;

export function normalizeSymbol(symbol: string): string {
  let code = symbol.trim().toUpperCase();
  code = code.replace(/\.(SH|SZ|HK|US)$/u, '');
  code = code.replace(/^(SH|SZ|HK)(?=\d)/u, '');
  return code;
}

/** 港股代码补齐为 5 位（保留前导零）。 */
export function normalizeHongKongSymbol(symbol: string): string {
  const digits = normalizeSymbol(symbol).replace(/\D/gu, '');
  if (digits.length === 0) return normalizeSymbol(symbol);
  return digits.padStart(5, '0');
}

export function detectExchangeMarket(symbol: string): ExchangeMarket | null {
  const code = normalizeSymbol(symbol);
  if (SH_CODE.test(code)) return 'SH';
  if (SZ_CODE.test(code)) return 'SZ';
  return null;
}

export function toSecidForVenue(symbol: string, venue: InstrumentVenue): string | null {
  if (venue === 'SH') return `1.${normalizeSymbol(symbol)}`;
  if (venue === 'SZ') return `0.${normalizeSymbol(symbol)}`;
  if (venue === 'HK') return `${EASTMONEY_MARKET_HK}.${normalizeHongKongSymbol(symbol)}`;
  if (venue === 'US') return `${EASTMONEY_MARKET_US}.${normalizeSymbol(symbol)}`;
  return null;
}

export function toSecid(symbol: string, venue?: InstrumentVenue): string | null {
  if (venue) return toSecidForVenue(symbol, venue);
  const code = normalizeSymbol(symbol);
  const market = detectExchangeMarket(code);
  if (market === 'SH') return `1.${code}`;
  if (market === 'SZ') return `0.${code}`;
  return null;
}

/** 从 EastMoney codetable 行推断上市地。 */
export function venueFromCodeTableRow(row: {
  code: string;
  market?: number;
  securityTypeName?: string;
  smallType?: number;
}): InstrumentVenue | null {
  const typeName = row.securityTypeName ?? '';
  if (typeName === '港股') {
    return row.smallType === 3 || row.smallType == null ? 'HK' : null;
  }
  if (typeName === '美股') {
    return row.smallType === 3 || row.smallType == null ? 'US' : null;
  }
  if (/基金/u.test(typeName)) return 'OTC';
  const cn = detectExchangeMarket(normalizeSymbol(row.code));
  if (cn) return cn;
  if (row.market === EASTMONEY_MARKET_HK) return 'HK';
  if (row.market === EASTMONEY_MARKET_US) return 'US';
  return null;
}

const SKIP_CODE_TABLE_TYPE_NAMES = new Set(['行业', '概念', '地区', '指数']);

/** codetable 命中是否可作为可交易标的展示。 */
export function isSearchableCodeTableRow(row: { securityTypeName?: string; smallType?: number }): boolean {
  const typeName = row.securityTypeName ?? '';
  if (SKIP_CODE_TABLE_TYPE_NAMES.has(typeName)) return false;
  if (typeName === '港股' || typeName === '美股') {
    return row.smallType === 3;
  }
  return true;
}

export function toF10Code(symbol: string): string | null {
  const code = normalizeSymbol(symbol);
  const market = detectExchangeMarket(code);
  if (market === 'SH') return `SH${code}`;
  if (market === 'SZ') return `SZ${code}`;
  return null;
}

export function classifyExchangeCode(symbol: string): InstrumentKind {
  const code = normalizeSymbol(symbol);
  if (LOF_CODE.test(code)) return 'lof';
  if (ETF_CODE.test(code)) return 'etf';
  return 'stock';
}

export function mapSecurityTypeName(typeName: string | null | undefined): InstrumentKind | 'unknown' {
  if (!typeName) return 'unknown';
  if (/基金/u.test(typeName)) return 'unknown';
  if (/沪|深|A股|主板|创业板|科创板/u.test(typeName)) return 'stock';
  return 'unknown';
}

export function mapDividendStatus(progress: string | null | undefined): DividendEventStatus {
  const text = progress ?? '';
  if (/实施分配|实施/u.test(text)) return 'implemented';
  if (/股东大会/u.test(text)) return 'announced';
  if (/董事会/u.test(text)) return 'proposed';
  return 'unknown';
}

export function parseEastMoneyDate(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function scalePrice(value: unknown): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return value / 100;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/** ulist + fltt=2 时 f60 昨收字段会失真，需用现价与涨跌幅反推。 */
export function isPlausiblePrevClose(prevClose: number | null, price: number): boolean {
  if (prevClose === null || prevClose <= 0 || price <= 0) return false;
  return Math.abs(prevClose - price) / price <= 0.3;
}

/** 由现价与涨跌幅（%）反推昨收与涨跌额。 */
export function deriveDayMoveFromPercent(price: number, changePercent: number): { prevClose: number; change: number } {
  const prevClose = price / (1 + changePercent / 100);
  return { prevClose, change: price - prevClose };
}
