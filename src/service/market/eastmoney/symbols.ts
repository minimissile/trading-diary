import type { InstrumentKind } from '../../../shared/market/types';

export type ExchangeMarket = 'SH' | 'SZ';

const SH_CODE = /^(60[0-9]|68[0-9]|51[0-9]|56[0-9]|58[0-9]|90[0-9])\d{3}$/u;
const SZ_CODE = /^(00[0-9]|30[0-9]|15[0-9]|16[0-9]|20[0-9])\d{3}$/u;
const ETF_CODE = /^(51[0-9]|56[0-9]|58[0-9]|15[0-9])\d{3}$/u;
const LOF_CODE = /^16[0-9]\d{3}$/u;

export function normalizeSymbol(symbol: string): string {
  let code = symbol.trim().toUpperCase();
  code = code.replace(/\.(SH|SZ)$/u, '');
  code = code.replace(/^(SH|SZ)(?=\d)/u, '');
  return code;
}

export function detectExchangeMarket(symbol: string): ExchangeMarket | null {
  const code = normalizeSymbol(symbol);
  if (SH_CODE.test(code)) return 'SH';
  if (SZ_CODE.test(code)) return 'SZ';
  return null;
}

export function toSecid(symbol: string): string | null {
  const code = normalizeSymbol(symbol);
  const market = detectExchangeMarket(code);
  if (market === 'SH') return `1.${code}`;
  if (market === 'SZ') return `0.${code}`;
  return null;
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

export function mapDividendStatus(progress: string | null | undefined): import('../../../shared/market/types').DividendEventStatus {
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
  return parsed.toISOString();
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
export function deriveDayMoveFromPercent(
  price: number,
  changePercent: number,
): { prevClose: number; change: number } {
  const prevClose = price / (1 + changePercent / 100);
  return { prevClose, change: price - prevClose };
}
