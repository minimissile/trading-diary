import type { CSSProperties, ElementType, ReactNode } from 'react';
import {
  DISPLAY_PRESETS,
  formatWithPreset,
  signedToneClass,
  type DisplayPresetKind,
} from '../../../shared/format/display-presets';

export interface ValueDisplayProps {
  /** 原始数值。 */
  value: number | null | undefined;
  /** 展示预设，决定格式与是否着色。 */
  kind: DisplayPresetKind;
  /** 渲染标签，默认 span。 */
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
}

export function buildValueDisplayClassName(
  value: number | null | undefined,
  kind: DisplayPresetKind,
  className?: string,
): string {
  const colored = DISPLAY_PRESETS[kind].colored ?? false;
  const toneClass = colored ? signedToneClass(value) : '';
  return ['td-value', `td-value--${kind}`, toneClass, className].filter(Boolean).join(' ');
}

/**
 * 统一数值展示组件：格式 + 涨跌色一次到位。
 *
 * 业务页面必须优先使用此组件；预设含义见 docs/NUMBER_FORMAT.md。
 * 持仓价格/份额请配合 pricePresetForKind、quantityPresetForKind。
 *
 * @see docs/NUMBER_FORMAT.md
 */
export function ValueDisplay({
  value,
  kind,
  as: Tag = 'span',
  className,
  style,
}: ValueDisplayProps): React.JSX.Element {
  const text = formatWithPreset(value, kind);

  return (
    <Tag
      className={buildValueDisplayClassName(value, kind, className) || undefined}
      style={style}
    >
      {text}
    </Tag>
  );
}

/** Ant Design Statistic 金额 formatter。 */
export function statisticCurrencyFormatter(value: string | number): ReactNode {
  return <ValueDisplay kind="currency" value={Number(value)} />;
}

/** Ant Design Statistic 盈亏 formatter。 */
export function statisticPnlFormatter(value: string | number): ReactNode {
  return <ValueDisplay kind="pnl" value={Number(value)} />;
}
