import type { InstrumentKind } from '../market/types';
import type { FormatCurrencyOptions, FormatNumberOptions } from './number-format';
import { formatDisplayCurrency, formatNumber } from './number-format';

/**
 * 数值展示预设（单一真相源）。
 *
 * 业务 UI 不得在此文件外自定义金额/价格格式；修改规则前请阅读 docs/NUMBER_FORMAT.md，
 * 并同步 tests/number-format.test.ts。
 *
 * @see docs/NUMBER_FORMAT.md
 */
export type DisplayPresetKind =
  | 'currency'
  | 'pnl'
  | 'price'
  | 'priceStock'
  | 'priceFund'
  | 'quantity'
  | 'quantityShares'
  | 'percent';

export interface DisplayPreset {
  /** 是否为货币（加 ¥ 前缀）。 */
  currency?: boolean;
  /** 后缀，如百分号。 */
  suffix?: string;
  /** 是否带 +/- 前缀。 */
  signed?: boolean;
  /** 是否应用涨跌色（由 ValueDisplay 处理）。 */
  colored?: boolean;
  number: FormatNumberOptions;
  currencyOptions?: Pick<FormatCurrencyOptions, 'currencySymbol'>;
}

/** 各场景的默认展示规则。 */
export const DISPLAY_PRESETS: Readonly<Record<DisplayPresetKind, DisplayPreset>> = {
  /** 普通金额：¥ + 千分位 + 最多 2 位小数 + 去末尾零。 */
  currency: {
    currency: true,
    signed: false,
    number: {
      maximumFractionDigits: 2,
      useGrouping: true,
      trimTrailingZeros: true,
    },
  },
  /** 盈亏金额：+/- + ¥ + 千分位 + 最多 2 位小数 + 去末尾零 + 涨跌色。 */
  pnl: {
    currency: true,
    signed: true,
    colored: true,
    number: {
      maximumFractionDigits: 2,
      useGrouping: true,
      trimTrailingZeros: true,
    },
  },
  /** 价格（通用）：最多 4 位小数，去末尾零，不使用千分位。 */
  price: {
    number: {
      maximumFractionDigits: 4,
      useGrouping: false,
      trimTrailingZeros: true,
    },
  },
  /** A 股 / 场内标的价格：固定 2 位小数。 */
  priceStock: {
    number: {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: false,
      trimTrailingZeros: false,
    },
  },
  /** 场外基金净值：最多 4 位小数，去末尾零。 */
  priceFund: {
    number: {
      maximumFractionDigits: 4,
      useGrouping: false,
      trimTrailingZeros: true,
    },
  },
  /** 场外基金份额：最多 4 位小数，去末尾零。 */
  quantity: {
    number: {
      maximumFractionDigits: 4,
      useGrouping: true,
      trimTrailingZeros: true,
    },
  },
  /** 股票 / 场内基金份额：整数展示。 */
  quantityShares: {
    number: {
      maximumFractionDigits: 0,
      useGrouping: true,
      trimTrailingZeros: true,
    },
  },
  /** 涨跌幅：+/- + 最多 2 位小数 + % + 涨跌色。 */
  percent: {
    suffix: '%',
    signed: true,
    colored: true,
    number: {
      maximumFractionDigits: 2,
      trimTrailingZeros: true,
    },
  },
};

/**
 * 按预设格式化数值。
 * @param value 原始数值
 * @param kind 展示预设
 * @returns 格式化字符串
 */
export function formatWithPreset(
  value: number | null | undefined,
  kind: DisplayPresetKind,
): string {
  const preset = DISPLAY_PRESETS[kind];
  if (value === null || value === undefined || Number.isNaN(value)) {
    return preset.number.fallback ?? '—';
  }

  let text: string;
  if (preset.currency) {
    text = formatDisplayCurrency(value, {
      signed: preset.signed,
      ...preset.number,
      ...preset.currencyOptions,
    });
  } else {
    text = formatNumber(value, {
      signed: preset.signed,
      ...preset.number,
    });
  }

  if (preset.suffix) {
    text = `${text}${preset.suffix}`;
  }

  return text;
}

export type SignedTone = 'profit' | 'loss' | 'neutral';

/**
 * 根据数值符号返回涨跌色调。
 * @param value 数值
 * @returns profit / loss / neutral
 */
export function signedTone(value: number | null | undefined): SignedTone {
  if (value === null || value === undefined || Number.isNaN(value) || value === 0) {
    return 'neutral';
  }
  return value > 0 ? 'profit' : 'loss';
}

/**
 * 返回涨跌色调对应的 CSS 类名。
 * @param value 数值
 * @returns td-value--profit / td-value--loss / 空字符串
 */
export function signedToneClass(value: number | null | undefined): string {
  const tone = signedTone(value);
  return tone === 'neutral' ? '' : `td-value--${tone}`;
}

/** 日收益卡片副文案。 */
export function formatDailyPnlCaption(
  dailyPnl: number,
  options?: { missingQuoteCount?: number },
): string {
  if (options?.missingQuoteCount && options.missingQuoteCount > 0) {
    return `${options.missingQuoteCount} 个标的暂无日收益`;
  }
  if (dailyPnl > 0) return '今日盈利中';
  if (dailyPnl < 0) return '今日亏损中';
  return '今日持平';
}

/** 浮动盈亏卡片副文案。 */
export function formatFloatingPnlCaption(
  pnl: number,
  options?: { missingQuoteCount?: number },
): string {
  if (options?.missingQuoteCount && options.missingQuoteCount > 0) {
    return `${options.missingQuoteCount} 个标的暂无现价`;
  }
  if (pnl > 0) return '当前盈利中';
  if (pnl < 0) return '当前亏损中';
  return '盈亏持平';
}

/** 根据标的类型解析份额展示预设。 */
export function quantityPresetForKind(kind?: InstrumentKind): 'quantity' | 'quantityShares' {
  return kind === 'otc_fund' ? 'quantity' : 'quantityShares';
}

/** 根据标的类型解析价格展示预设。 */
export function pricePresetForKind(kind?: InstrumentKind): 'priceFund' | 'priceStock' {
  return kind === 'otc_fund' ? 'priceFund' : 'priceStock';
}

/**
 * CountUp 动画内部会先 toFixed(decimalPlaces)，必须与预设最大精度一致，否则会截断小数。
 */
export function animationDecimalPlacesForPreset(kind: DisplayPresetKind): number {
  const { minimumFractionDigits = 0, maximumFractionDigits = 2 } = DISPLAY_PRESETS[kind].number;
  return Math.max(minimumFractionDigits, maximumFractionDigits);
}
