import type { InstrumentKind } from '../market/types';

/** 按标的类型取整卖出数量。 */
export function roundSellQuantity(quantity: number, kind: InstrumentKind): number {
  if (kind === 'otc_fund') {
    return Math.round(quantity * 10_000) / 10_000;
  }
  return Math.floor(quantity + 1e-9);
}

export function quantityFromFraction(holding: number, fraction: number, kind: InstrumentKind): number {
  if (fraction >= 1) return holding;
  return Math.min(holding, roundSellQuantity(holding * fraction, kind));
}

export const SELL_FRACTION_PRESETS = [
  { label: '1/4', fraction: 0.25 },
  { label: '1/3', fraction: 1 / 3 },
  { label: '1/2', fraction: 0.5 },
  { label: '2/3', fraction: 2 / 3 },
  { label: '全仓', fraction: 1 },
] as const;
