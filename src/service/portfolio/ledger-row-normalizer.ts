import type { PortfolioLedgerSide } from '../../shared/portfolio/types';
import type { LedgerAiExtractedRecord } from '../../shared/portfolio/ledger-import-types';

export interface NormalizedLedgerTradeRow {
  symbol: string;
  side: PortfolioLedgerSide;
  tradeAt: string;
  price: number;
  quantity: number;
  fees: number;
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

/** 将 AI 提取的买卖流水标准化为持仓流水结构。 */
export function normalizeLedgerTradeRecord(
  record: LedgerAiExtractedRecord,
): { ok: true; value: NormalizedLedgerTradeRow } | { ok: false; message: string } {
  if (record.recordKind !== 'trade') {
    return { ok: false, message: '非买卖流水' };
  }

  const symbol = normalizeSymbol(String(record.symbol ?? ''));
  if (!symbol) return { ok: false, message: '标的代码无效' };

  if (record.side !== 'buy' && record.side !== 'sell') {
    return { ok: false, message: '买卖方向无效' };
  }

  const tradeAt = parseTradeAt(String(record.tradeAt ?? ''));
  if (!tradeAt) return { ok: false, message: '成交日期无效' };

  let price = record.price;
  let quantity = record.quantity;

  if (price === null && record.amount !== null && quantity !== null && quantity > 0) {
    price = record.amount / quantity;
  }
  if (quantity === null && record.amount !== null && price !== null && price > 0) {
    quantity = record.amount / price;
  }

  if (price === null || price <= 0) return { ok: false, message: '成交价格无效' };
  if (quantity === null || quantity <= 0) return { ok: false, message: '成交数量无效' };

  const feesRaw = record.fees;
  const fees = feesRaw === null ? 0 : feesRaw;
  if (fees < 0) return { ok: false, message: '手续费无效' };

  return {
    ok: true,
    value: {
      symbol,
      side: record.side,
      tradeAt,
      price,
      quantity,
      fees,
    },
  };
}

/** 解析字符串数字（供测试）。 */
export function parseLedgerNumber(raw: string): number | null {
  return parseNumber(raw);
}
