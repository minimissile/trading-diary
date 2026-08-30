import type { InstrumentVenue, QuoteCurrency } from './venues';
import { quoteCurrencyForVenue } from './venues';

/** 规范化后的标的引用。 */
export interface InstrumentRef {
  venue: InstrumentVenue;
  /** 不含后缀的规范化代码（港股保留前导零）。 */
  symbol: string;
  quoteCurrency: QuoteCurrency;
}

const HK_SUFFIX = /\.HK$/u;
const US_SUFFIX = /\.(US|NASDAQ|NYSE|AMEX)$/u;
const CN_SUFFIX = /\.(SH|SZ|SS|XSHE|XSHG)$/u;

const SH_CODE = /^(60[0-9]|68[0-9]|51[0-9]|56[0-9]|58[0-9]|90[0-9])\d{3}$/u;
const SZ_CODE = /^(00[0-9]|30[0-9]|15[0-9]|16[0-9]|20[0-9])\d{3}$/u;
const HK_CODE = /^\d{1,5}$/u;
const US_CODE = /^[A-Z][A-Z0-9.-]{0,9}$/u;

function padHongKongSymbol(code: string): string {
  const digits = code.replace(/\D/gu, '');
  if (digits.length === 0) return code;
  return digits.padStart(5, '0');
}

function normalizeUsSymbol(code: string): string {
  return code.toUpperCase().replace(/-/gu, '.');
}

/** 持仓 / 流水聚合键。 */
export function instrumentPositionKey(ref: Pick<InstrumentRef, 'venue' | 'symbol'>): string {
  return `${ref.venue}:${ref.symbol}`;
}

/** 从 position key 解析 venue 与 symbol。 */
export function parseInstrumentPositionKey(key: string): InstrumentRef | null {
  const idx = key.indexOf(':');
  if (idx <= 0) return null;
  const venue = key.slice(0, idx) as InstrumentVenue;
  const symbol = key.slice(idx + 1);
  if (!symbol) return null;
  if (venue !== 'SH' && venue !== 'SZ' && venue !== 'HK' && venue !== 'US' && venue !== 'OTC') {
    return null;
  }
  return { venue, symbol, quoteCurrency: quoteCurrencyForVenue(venue) };
}

/** 按 A 股代码规则推断 venue（仅 CN）。 */
export function inferCnVenueFromSymbol(symbol: string): 'SH' | 'SZ' | null {
  const code = symbol.trim().toUpperCase().replace(CN_SUFFIX, '');
  if (SH_CODE.test(code)) return 'SH';
  if (SZ_CODE.test(code)) return 'SZ';
  return null;
}

/** 解析用户输入或存储 symbol，可选默认 venue（来自账户 scope）。 */
export function parseInstrumentInput(
  raw: string,
  options: { defaultVenue?: InstrumentVenue; kind?: 'stock' | 'etf' | 'lof' | 'otc_fund' } = {},
): InstrumentRef {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('标的代码不能为空');

  let upper = trimmed.toUpperCase();

  if (options.kind === 'otc_fund') {
    const code = upper.replace(CN_SUFFIX, '');
    return { venue: 'OTC', symbol: code, quoteCurrency: 'CNY' };
  }

  if (HK_SUFFIX.test(upper)) {
    const code = padHongKongSymbol(upper.replace(HK_SUFFIX, ''));
    return { venue: 'HK', symbol: code, quoteCurrency: 'HKD' };
  }

  if (US_SUFFIX.test(upper)) {
    const code = normalizeUsSymbol(upper.replace(US_SUFFIX, ''));
    return { venue: 'US', symbol: code, quoteCurrency: 'USD' };
  }

  if (CN_SUFFIX.test(upper)) {
    const suffix = upper.match(CN_SUFFIX)?.[0] ?? '';
    const code = upper.replace(CN_SUFFIX, '');
    if (/\.SH$|\.SS$|\.XSHG$/u.test(suffix)) {
      return { venue: 'SH', symbol: code, quoteCurrency: 'CNY' };
    }
    return { venue: 'SZ', symbol: code, quoteCurrency: 'CNY' };
  }

  if (upper.startsWith('HK') && /^HK\d{1,5}$/u.test(upper)) {
    const code = padHongKongSymbol(upper.slice(2));
    return { venue: 'HK', symbol: code, quoteCurrency: 'HKD' };
  }

  const cn = inferCnVenueFromSymbol(upper);
  if (cn) {
    const code = upper.replace(CN_SUFFIX, '');
    return { venue: cn, symbol: code, quoteCurrency: 'CNY' };
  }

  if (HK_CODE.test(upper) && options.defaultVenue === 'HK') {
    return { venue: 'HK', symbol: padHongKongSymbol(upper), quoteCurrency: 'HKD' };
  }

  if (US_CODE.test(upper) && (options.defaultVenue === 'US' || !/^\d+$/u.test(upper))) {
    return { venue: 'US', symbol: normalizeUsSymbol(upper), quoteCurrency: 'USD' };
  }

  if (options.defaultVenue) {
    const symbol =
      options.defaultVenue === 'HK'
        ? padHongKongSymbol(upper)
        : options.defaultVenue === 'US'
          ? normalizeUsSymbol(upper)
          : upper.replace(CN_SUFFIX, '');
    return {
      venue: options.defaultVenue,
      symbol,
      quoteCurrency: quoteCurrencyForVenue(options.defaultVenue),
    };
  }

  if (HK_CODE.test(upper) && upper.length <= 5) {
    return { venue: 'HK', symbol: padHongKongSymbol(upper), quoteCurrency: 'HKD' };
  }

  if (US_CODE.test(upper)) {
    return { venue: 'US', symbol: normalizeUsSymbol(upper), quoteCurrency: 'USD' };
  }

  throw new Error(`无法识别标的代码：${raw}`);
}

/** 格式化展示用代码（带 venue 后缀）。 */
export function formatInstrumentSymbol(ref: Pick<InstrumentRef, 'venue' | 'symbol'>): string {
  switch (ref.venue) {
    case 'HK':
      return `${ref.symbol}.HK`;
    case 'US':
      return ref.symbol;
    case 'SH':
      return `${ref.symbol}.SH`;
    case 'SZ':
      return `${ref.symbol}.SZ`;
    default:
      return ref.symbol;
  }
}

/** 供行情 API 使用的 lookup key（兼容旧 CN 裸代码）。 */
export function marketLookupKey(ref: Pick<InstrumentRef, 'venue' | 'symbol'>): string {
  if (ref.venue === 'SH' || ref.venue === 'SZ' || ref.venue === 'OTC') {
    return ref.symbol;
  }
  return formatInstrumentSymbol(ref);
}

/** 迁移回填：由 kind + symbol 推断 venue。 */
export function inferVenueForMigration(kind: string, symbol: string): InstrumentVenue {
  if (kind === 'otc_fund') return 'OTC';
  const cn = inferCnVenueFromSymbol(symbol);
  if (cn) return cn;
  if (/^\d{1,5}$/u.test(symbol)) return 'HK';
  if (US_CODE.test(symbol.toUpperCase())) return 'US';
  return 'SH';
}
