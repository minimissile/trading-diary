/**
 * 数值格式化底层引擎。
 *
 * 渲染层与业务模块应使用 display-presets / ValueDisplay，不要直接调用本模块。
 *
 * @see docs/NUMBER_FORMAT.md
 */
export interface FormatNumberOptions {
  /** 最小小数位数，默认 0。 */
  minimumFractionDigits?: number;
  /** 最大小数位数，默认 2。 */
  maximumFractionDigits?: number;
  /** 是否使用千分位分隔，默认 false。 */
  useGrouping?: boolean;
  /** 是否去除小数末尾零，默认 true。 */
  trimTrailingZeros?: boolean;
  /** 是否为正数添加 + 前缀，负数始终带 -，默认 false。 */
  signed?: boolean;
  /** 无效值时的占位符，默认 —。 */
  fallback?: string;
}

function trimFractionZeros(formatted: string): string {
  if (!formatted.includes('.')) return formatted;
  return formatted.replace(/(\.\d*?[1-9])0+$/u, '$1').replace(/\.0+$/u, '');
}

/**
 * 格式化数值展示，支持精度、千分位与末尾零处理。
 * @param value 待格式化的数值
 * @param options 展示选项
 * @returns 格式化后的字符串
 */
export function formatNumber(value: number | null | undefined, options: FormatNumberOptions = {}): string {
  const {
    minimumFractionDigits = 0,
    maximumFractionDigits = 2,
    useGrouping = false,
    trimTrailingZeros = true,
    signed = false,
    fallback = '—',
  } = options;

  if (value === null || value === undefined || Number.isNaN(value)) {
    return fallback;
  }

  const absValue = Math.abs(value);
  let formatted = new Intl.NumberFormat('zh-CN', {
    useGrouping,
    minimumFractionDigits: trimTrailingZeros ? 0 : minimumFractionDigits,
    maximumFractionDigits,
  }).format(absValue);

  if (trimTrailingZeros) {
    formatted = trimFractionZeros(formatted);
  }

  if (signed) {
    if (value > 0) return `+${formatted}`;
    if (value < 0) return `-${formatted}`;
    return formatted;
  }

  if (value < 0) return `-${formatted}`;
  return formatted;
}

export interface FormatCurrencyOptions extends Omit<FormatNumberOptions, 'signed'> {
  /** 货币符号，默认 ¥。 */
  currencySymbol?: string;
  /** 是否为正数添加 + 前缀。 */
  signed?: boolean;
}

/**
 * 格式化货币展示。
 * @param value 金额
 * @param options 展示选项
 * @returns 带货币符号的字符串
 */
export function formatDisplayCurrency(
  value: number | null | undefined,
  options: FormatCurrencyOptions = {},
): string {
  const { currencySymbol = '¥', signed = false, ...numberOptions } = options;
  const formatted = formatNumber(value, {
    maximumFractionDigits: 2,
    useGrouping: true,
    trimTrailingZeros: true,
    signed,
    ...numberOptions,
  });
  if (formatted === (options.fallback ?? '—')) return formatted;

  if (signed && formatted.startsWith('+')) {
    return `+${currencySymbol}${formatted.slice(1)}`;
  }
  if (formatted.startsWith('-')) {
    return `-${currencySymbol}${formatted.slice(1)}`;
  }
  return `${currencySymbol}${formatted}`;
}
