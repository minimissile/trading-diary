import type { PortfolioLedgerEntry } from '../../shared/portfolio/types';
import { tradeCalendarDate } from '../../shared/trade-calendar';

const MONEY_SCALE = 100;

function roundMoney(value: number): number {
  return Math.round(value * MONEY_SCALE) / MONEY_SCALE;
}

interface TBuyLot {
  originalQty: number;
  remaining: number;
  price: number;
  fees: number;
}

/**
 * 同日「先买后卖」做 T 配对（LIFO）：卖出价 − 买入价 − 分摊买卖费用。
 * 仅统计正 T；当日先卖后买的倒 T 不在此列展示。
 */
export function computeTTradingPnlForSell(
  sellEntry: PortfolioLedgerEntry,
  sellQty: number,
  sameDayBuyLots: readonly TBuyLot[],
): number | null {
  if (sellQty <= 0 || sameDayBuyLots.length === 0) return null;

  let remaining = sellQty;
  let matchedQty = 0;
  let tPnl = 0;

  for (let index = sameDayBuyLots.length - 1; index >= 0 && remaining > 1e-8; index -= 1) {
    const lot = sameDayBuyLots[index]!;
    if (lot.remaining <= 1e-8) continue;

    const matchQty = Math.min(remaining, lot.remaining);
    const sellFeeShare = sellEntry.fees * (matchQty / sellQty);
    const buyFeeShare = lot.fees * (matchQty / lot.originalQty);
    tPnl += matchQty * (sellEntry.price - lot.price) - sellFeeShare - buyFeeShare;
    lot.remaining -= matchQty;
    remaining -= matchQty;
    matchedQty += matchQty;
  }

  if (matchedQty <= 1e-8) return null;
  return roundMoney(tPnl);
}

/** 场内流水是否参与做 T 配对。 */
export function supportsTTrading(kind: PortfolioLedgerEntry['kind']): boolean {
  return kind !== 'otc_fund';
}

export type TBuyLotMutable = TBuyLot;

export function createTBuyLot(entry: PortfolioLedgerEntry, quantity: number): TBuyLotMutable {
  return {
    originalQty: quantity,
    remaining: quantity,
    price: entry.price,
    fees: entry.fees,
  };
}

export function tTradingDayKey(entry: PortfolioLedgerEntry): string {
  return tradeCalendarDate(entry.tradeAt);
}
