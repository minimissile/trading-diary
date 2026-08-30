import type { DividendEvent } from '../market/types';
import type { InstrumentKind } from '../market/types';

export type DividendPayoutMode = 'cash' | 'reinvest';

const PAYOUT_MODE_LABELS: Record<DividendPayoutMode, string> = {
  cash: '现金分红',
  reinvest: '红利再投资',
};

/** 是否支持切换分红方式（场外基金与部分场内基金）。 */
export function supportsDividendPayoutMode(kind: InstrumentKind): boolean {
  return kind === 'otc_fund' || kind === 'lof' || kind === 'etf';
}

export function dividendPayoutModeLabel(mode: DividendPayoutMode): string {
  return PAYOUT_MODE_LABELS[mode];
}

/**
 * 生成分红方式偏好存储键（按账户 + 标的）。
 */
export function dividendPayoutModeStorageKey(accountId: string, symbol: string): string {
  return `dividend_payout_mode:${accountId}:${symbol.trim().toUpperCase()}`;
}

export function normalizeDividendPayoutMode(raw: unknown): DividendPayoutMode | null {
  return raw === 'cash' || raw === 'reinvest' ? raw : null;
}

/** 从 API 分红文案推断分红方式。 */
export function inferDividendPayoutModeFromEvent(event: Pick<DividendEvent, 'planText' | 'progress'>): DividendPayoutMode | null {
  const text = `${event.planText} ${event.progress}`;
  if (/红利再投资|再投资|红利转投|复投/u.test(text)) return 'reinvest';
  if (/现金分红|派现|现金/u.test(text)) return 'cash';
  return null;
}

export function resolveDividendPayoutMode(input: {
  kind: InstrumentKind;
  event?: Pick<DividendEvent, 'planText' | 'progress'>;
  defaultMode?: DividendPayoutMode | null;
}): DividendPayoutMode {
  if (!supportsDividendPayoutMode(input.kind)) return 'cash';
  const inferred = input.event ? inferDividendPayoutModeFromEvent(input.event) : null;
  return inferred ?? input.defaultMode ?? 'cash';
}
