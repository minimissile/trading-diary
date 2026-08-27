import type { ExecutionSide } from '../../shared/episodes/types';
import type { ExecutionColumnMapping } from '../../shared/import/types';

const SIDE_BUY = new Set(['买', '买入', 'b', 'buy', '1', '证券买入', '融资买入']);
const SIDE_SELL = new Set(['卖', '卖出', 's', 'sell', '-1', '2', '证券卖出', '融资卖出']);

export interface NormalizedExecutionRow {
  symbol: string;
  side: ExecutionSide;
  quantity: number;
  price: number;
  fees: number;
  tradeAt: string;
}

function cell(row: readonly string[], index: number): string {
  if (index < 0 || index >= row.length) return '';
  return row[index]?.trim() ?? '';
}

function parseSide(raw: string): ExecutionSide | null {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;
  if (SIDE_BUY.has(normalized) || normalized.includes('买')) return 'buy';
  if (SIDE_SELL.has(normalized) || normalized.includes('卖')) return 'sell';
  return null;
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

/**
 * 将 CSV 行标准化为成交录入结构。
 */
export function normalizeExecutionRow(
  row: readonly string[],
  mapping: ExecutionColumnMapping,
): { ok: true; value: NormalizedExecutionRow } | { ok: false; message: string } {
  const symbolRaw = cell(row, mapping.symbol);
  const symbol = normalizeSymbol(symbolRaw);
  if (!symbol) return { ok: false, message: '标的代码无效' };

  const side = parseSide(cell(row, mapping.side));
  if (!side) return { ok: false, message: '买卖方向无法识别' };

  const quantity = parseNumber(cell(row, mapping.quantity));
  if (quantity === null || quantity <= 0) return { ok: false, message: '成交数量无效' };

  const price = parseNumber(cell(row, mapping.price));
  if (price === null || price <= 0) return { ok: false, message: '成交价格无效' };

  const feesRaw = mapping.fees >= 0 ? cell(row, mapping.fees) : '';
  const feesParsed = feesRaw ? parseNumber(feesRaw) : 0;
  const fees = feesParsed === null || feesParsed < 0 ? 0 : feesParsed;

  const tradeAt = parseTradeAt(cell(row, mapping.tradeAt));
  if (!tradeAt) return { ok: false, message: '成交时间无法解析' };

  return {
    ok: true,
    value: { symbol, side, quantity, price, fees, tradeAt },
  };
}
