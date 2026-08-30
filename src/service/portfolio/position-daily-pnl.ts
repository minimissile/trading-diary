import type { InstrumentKind, MarketQuote } from '../../shared/market/types';
import type { PortfolioLedgerEntry } from '../../shared/portfolio/types';
import {
  isTradingDay,
  isExchangeDailyPnlSessionActive,
  shouldCountOtcFundDailyPnl,
  shouldUseReferenceDailyPnl,
  todayCalendarDate,
  tradeCalendarDate,
} from '../../shared/trade-calendar';
import { ledgerQuantityDelta } from './ledger-service';

type QuoteDailyInput = Pick<MarketQuote, 'change' | 'changePercent' | 'price' | 'prevClose' | 'navDate' | 'nav'>;

export interface PositionDailyPnlInput {
  kind: InstrumentKind;
  entries: readonly PortfolioLedgerEntry[];
  marketPrice: number | null;
  quote: QuoteDailyInput | undefined;
  asOf?: Date;
  /** 参考浮动盈亏；建仓初期日收益与之对齐同花顺。 */
  referenceUnrealizedPnl?: number | null;
  firstBuyAt?: string | null;
}

interface RemainingLot {
  buyDate: string;
  buyPrice: number;
  quantity: number;
}

function effectiveBuyPrice(entry: PortfolioLedgerEntry, quantity: number): number {
  return (quantity * entry.price + entry.fees) / quantity;
}

function sortLedger(entries: readonly PortfolioLedgerEntry[]): PortfolioLedgerEntry[] {
  return [...entries].sort((a, b) => {
    const timeDiff = a.tradeAt.localeCompare(b.tradeAt);
    if (timeDiff !== 0) return timeDiff;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

function consumeLots(lots: RemainingLot[], sellQty: number): void {
  let remaining = sellQty;
  while (remaining > 0 && lots.length > 0) {
    const lot = lots[0]!;
    const take = Math.min(remaining, lot.quantity);
    lot.quantity -= take;
    remaining -= take;
    if (lot.quantity <= 1e-8) lots.shift();
  }
}

export function resolveFirstBuyDay(entries: readonly PortfolioLedgerEntry[]): string | null {
  let first: string | null = null;
  for (const entry of entries) {
    if (ledgerQuantityDelta(entry) <= 0) continue;
    const day = tradeCalendarDate(entry.tradeAt);
    if (first === null || day < first) first = day;
  }
  return first;
}

/** 行情提供的每股当日涨跌额。 */
export function resolveDayChangePerShare(
  quote: QuoteDailyInput,
  marketPrice: number | null,
): number | null {
  const price = quote.price ?? marketPrice;

  if (
    price !== null &&
    quote.prevClose !== null &&
    !Number.isNaN(quote.prevClose) &&
    Math.abs(quote.prevClose - price) / price <= 0.3
  ) {
    const diff = price - quote.prevClose;
    if (Math.abs(diff) > 1e-9) return diff;
  }

  if (price !== null && quote.changePercent !== null && !Number.isNaN(quote.changePercent)) {
    return (price * quote.changePercent) / (100 + quote.changePercent);
  }

  if (quote.change !== null && !Number.isNaN(quote.change)) {
    return quote.change;
  }

  if (
    quote.price !== null &&
    quote.prevClose !== null &&
    !Number.isNaN(quote.price) &&
    !Number.isNaN(quote.prevClose)
  ) {
    const diff = quote.price - quote.prevClose;
    if (Math.abs(diff) > 1e-9) return diff;
  }

  return null;
}

function isExchangeTradedKind(kind: InstrumentKind): boolean {
  return kind === 'stock' || kind === 'etf' || kind === 'lof';
}

/**
 * 持仓日收益（对齐同花顺）：
 * - 建仓当日 / 上一自然日：参考浮盈
 * - 其余存量：份额 × 当日涨跌额
 * - 当日卖出：份额 × (卖出价 − 成本价)
 * - 场外基金非交易日：日收益为 0，除非当日净值有更新（如部分货币基金）
 */
export function computePositionDailyPnl(input: PositionDailyPnlInput): number | null {
  const { kind, entries, marketPrice, quote, asOf, referenceUnrealizedPnl, firstBuyAt } = input;
  if (!quote || marketPrice === null || entries.length === 0) return null;

  const today = todayCalendarDate(asOf ?? new Date());
  const asOfDate = asOf ?? new Date();
  if (isExchangeTradedKind(kind)) {
    if (!isTradingDay(today) || !isExchangeDailyPnlSessionActive(asOfDate)) {
      return 0;
    }
  }
  if (
    kind === 'otc_fund' &&
    !shouldCountOtcFundDailyPnl({
      date: today,
      navDate: quote.navDate,
      close: quote.nav ?? quote.price,
      prevClose: quote.prevClose,
    })
  ) {
    return 0;
  }
  const firstBuyDay = firstBuyAt ? tradeCalendarDate(firstBuyAt) : resolveFirstBuyDay(entries);
  if (
    firstBuyDay &&
    referenceUnrealizedPnl !== null &&
    referenceUnrealizedPnl !== undefined &&
    shouldUseReferenceDailyPnl(firstBuyDay, today, kind)
  ) {
    return referenceUnrealizedPnl;
  }

  // 仅「当日首次建仓」时，当日买入批次按成本计日收益；加仓或错录周末日期仍按行情日涨跌。
  const useTodayCostBasis = firstBuyDay === today;

  const lots: RemainingLot[] = [];
  let pnl = 0;

  for (const entry of sortLedger(entries)) {
    const entryDay = tradeCalendarDate(entry.tradeAt);
    if (entryDay > today) continue;

    const delta = ledgerQuantityDelta(entry);
    if (delta > 0) {
      const buyPrice = effectiveBuyPrice(entry, delta);
      if (useTodayCostBasis && entryDay === today) {
        pnl += delta * (marketPrice - buyPrice);
      }
      lots.push({ buyDate: entryDay, buyPrice, quantity: delta });
      continue;
    }

    const heldQty = lots.reduce((sum, lot) => sum + lot.quantity, 0);
    const sellQty = Math.min(Math.abs(delta), heldQty);
    if (sellQty <= 0) continue;

    if (entryDay === today) {
      let remaining = sellQty;
      for (const lot of lots) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, lot.quantity);
        if (take <= 0) continue;
        pnl += take * (entry.price - lot.buyPrice);
        lot.quantity -= take;
        remaining -= take;
      }
      lots.splice(0, lots.length, ...lots.filter((lot) => lot.quantity > 1e-8));
      continue;
    }

    consumeLots(lots, sellQty);
  }

  const dayChange = resolveDayChangePerShare(quote, marketPrice);
  if (dayChange === null) {
    return pnl === 0 ? null : pnl;
  }

  for (const lot of lots) {
    if (useTodayCostBasis && lot.buyDate === today) continue;
    pnl += lot.quantity * dayChange;
  }

  return pnl;
}

export function sumDailyPnl(values: ReadonlyArray<number | null>): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}
