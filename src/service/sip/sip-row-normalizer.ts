import type { SipColumnMapping } from '../../shared/sip/import-types';
import { computeQuantityFromAmount } from './sip-scheduler';

export interface NormalizedSipImportRow {
  symbol: string;
  tradeAt: string;
  nav: number;
  amount: number;
  quantity: number;
  fees: number;
  scheduledDate: string;
}

function cell(row: readonly string[], index: number): string {
  if (index < 0 || index >= row.length) return '';
  return row[index]?.trim() ?? '';
}

function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/[,，\s￥¥元]/gu, '').trim();
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function normalizeSymbol(raw: string): string {
  const cleaned = raw.trim().toUpperCase().replace(/\.(SH|SZ|SS|XSHE|XSHG)$/u, '');
  const digits = cleaned.match(/\d{6}/u);
  if (digits) return digits[0];
  return cleaned;
}

function parseTradeAt(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  const normalized = value
    .replace(/\//gu, '-')
    .replace(/年/gu, '-')
    .replace(/月/gu, '-')
    .replace(/日/gu, '')
    .replace(/\./gu, '-')
    .trim();

  const direct = Date.parse(normalized.includes('T') ? normalized : normalized.replace(' ', 'T'));
  if (Number.isFinite(direct)) return new Date(direct).toISOString();

  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/u);
  if (!match) return null;

  const [, year, month, day, hour = '9', minute = '30', second = '0'] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** 将结构化字段标准化为定投导入结构。 */
export function normalizeSipImportValues(input: {
  symbol?: string | null;
  tradeAt?: string | null;
  nav?: number | null;
  amount?: number | null;
  quantity?: number | null;
  fees?: number | null;
}): { ok: true; value: NormalizedSipImportRow } | { ok: false; message: string } {
  const symbol = normalizeSymbol(String(input.symbol ?? ''));
  if (!symbol) return { ok: false, message: '标的代码无效' };

  const tradeAt = parseTradeAt(String(input.tradeAt ?? ''));
  if (!tradeAt) return { ok: false, message: '扣款日期无法解析' };

  const nav = typeof input.nav === 'number' ? input.nav : parseNumber(String(input.nav ?? ''));
  if (nav === null || nav <= 0) return { ok: false, message: '净值无效' };

  const amount = typeof input.amount === 'number' ? input.amount : parseNumber(String(input.amount ?? ''));
  if (amount === null || amount <= 0) return { ok: false, message: '扣款金额无效' };

  const feesParsed =
    typeof input.fees === 'number'
      ? input.fees
      : input.fees === null || input.fees === undefined
        ? 0
        : parseNumber(String(input.fees));
  const fees = feesParsed === null || feesParsed < 0 ? 0 : feesParsed;

  const quantityParsed =
    typeof input.quantity === 'number'
      ? input.quantity
      : input.quantity === null || input.quantity === undefined
        ? null
        : parseNumber(String(input.quantity));
  const quantity =
    quantityParsed !== null && quantityParsed > 0 ? quantityParsed : computeQuantityFromAmount(amount, nav, fees);
  if (quantity <= 0) return { ok: false, message: '确认份额无效' };

  return {
    ok: true,
    value: {
      symbol,
      tradeAt,
      nav,
      amount,
      quantity,
      fees,
      scheduledDate: tradeAt.slice(0, 10),
    },
  };
}

/** 将 CSV 行标准化为定投导入结构。 */
export function normalizeSipImportRow(
  row: readonly string[],
  mapping: SipColumnMapping,
): { ok: true; value: NormalizedSipImportRow } | { ok: false; message: string } {
  const feesRaw = mapping.fees >= 0 ? cell(row, mapping.fees) : '';
  const quantityRaw = mapping.quantity >= 0 ? cell(row, mapping.quantity) : '';

  return normalizeSipImportValues({
    symbol: cell(row, mapping.symbol),
    tradeAt: cell(row, mapping.tradeAt),
    nav: parseNumber(cell(row, mapping.nav)),
    amount: parseNumber(cell(row, mapping.amount)),
    quantity: quantityRaw ? parseNumber(quantityRaw) : null,
    fees: feesRaw ? parseNumber(feesRaw) : 0,
  });
}
