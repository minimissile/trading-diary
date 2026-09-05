import type {
  StockBacktestInput,
  StockBacktestResult,
  StockCandidate,
  StockStrategySettings,
  StrategyBar,
  StrategyEquityPoint,
  StrategySeries,
  StrategyTrade,
} from '../../shared/strategy/types';
import { STOCK_STRATEGY_ASSUMPTIONS } from '../../shared/strategy/catalog';

const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
const money = (value: number): number => Math.round(value * 100) / 100;
const ratio = (value: number, base: number): number => value / base - 1;

export function evaluateStock(series: StrategySeries, date: string, settings: StockStrategySettings): StockCandidate | null {
  const bars = series.bars.filter((bar) => bar.date <= date);
  const last = bars.at(-1);
  if (bars.length < 61 || !last || last.date !== date || last.volume <= 0 || /ST|退/iu.test(series.name)) return null;
  const previous = bars.at(-2)!;
  const ma20 = mean(bars.slice(-20).map((bar) => bar.close));
  const ma60 = mean(bars.slice(-60).map((bar) => bar.close));
  const momentum20 = ratio(last.close, bars.at(-21)!.close);
  const momentum60 = ratio(last.close, bars.at(-61)!.close);
  const averageVolume = mean(bars.slice(-21, -1).map((bar) => bar.volume));
  if (averageVolume <= 0) return null;
  const volumeRatio = last.volume / averageVolume;
  const returns = bars.slice(-20).map((bar, index) => ratio(bar.close, bars[bars.length - 21 + index]!.close));
  const averageReturn = mean(returns);
  const volatility = Math.sqrt(mean(returns.map((value) => (value - averageReturn) ** 2)));
  const distance = ratio(last.close, ma20);
  const previousHigh = Math.max(...bars.slice(-21, -1).map((bar) => bar.high));
  let score: number;
  let reasons: string[];
  switch (settings.strategyId) {
    case 'momentum':
      if (!(last.close > ma20 && ma20 > ma60 && momentum20 > 0 && distance <= 0.15)) return null;
      score = momentum20 / Math.max(volatility, 0.005);
      reasons = [
        '价格与均线呈多头排列',
        `20 日涨幅 ${(momentum20 * 100).toFixed(2)}%`,
        `距 20 日线 ${(distance * 100).toFixed(2)}%`,
      ];
      break;
    case 'breakout':
      if (!(last.close > previousHigh && last.close > ma60 && volumeRatio >= 1.5)) return null;
      score = ratio(last.close, previousHigh) * 100 + volumeRatio;
      reasons = ['收盘突破此前 20 日高点', `量比 ${volumeRatio.toFixed(2)} 倍`, '价格高于 60 日线'];
      break;
    case 'pullback':
      if (!(ma20 > ma60 && momentum60 > 0 && Math.abs(distance) <= 0.03 && last.close > previous.close && volumeRatio <= 1.2))
        return null;
      score = (0.03 - Math.abs(distance)) * 100 + momentum60 * 10;
      reasons = ['中期上升趋势', `距 20 日线 ${(distance * 100).toFixed(2)}%`, `缩量企稳，量比 ${volumeRatio.toFixed(2)}`];
      break;
  }
  return {
    symbol: series.symbol,
    name: series.name,
    signalDate: date,
    rank: 0,
    score,
    referencePrice: last.rawClose,
    momentum20: momentum20 * 100,
    volumeRatio,
    volatility20: volatility * 100,
    reasons,
  };
}

export function rankStocks(series: StrategySeries[], date: string, settings: StockStrategySettings): StockCandidate[] {
  return series
    .map((item) => evaluateStock(item, date, settings))
    .filter((item): item is StockCandidate => item !== null)
    .sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol))
    .slice(0, settings.topN)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

export function strategyFees(amount: number, side: 'buy' | 'sell', settings: StockStrategySettings): number {
  return money(
    Math.max(settings.minimumCommission, (amount * settings.commissionBps) / 10_000) +
      (side === 'sell' ? (amount * settings.stampDutyBps) / 10_000 : 0),
  );
}

export function affordableQuantity(symbol: string, price: number, budget: number, settings: StockStrategySettings): number {
  const star = symbol.startsWith('688');
  const step = star ? 1 : 100;
  let quantity = Math.floor(budget / (price * (1 + settings.commissionBps / 10_000)) / step) * step;
  while (quantity > 0 && money(quantity * price) + strategyFees(money(quantity * price), 'buy', settings) > budget)
    quantity -= step;
  return quantity < (star ? 200 : 100) ? 0 : quantity;
}

function openBlocked(
  symbol: string,
  bar: StrategyBar | undefined,
  previous: StrategyBar | undefined,
  side: 'buy' | 'sell',
): boolean {
  if (!bar || !previous || bar.volume <= 0) return true;
  const limit = symbol.startsWith('30') || symbol.startsWith('688') ? 0.2 : 0.1;
  // Adjusted return avoids treating ex-dividend gaps as limit-down. Conservative 0.5 pp buffer.
  const move = ratio(bar.open, previous.close);
  return side === 'buy' ? move >= limit - 0.005 : move <= -limit + 0.005;
}

interface Position {
  series: StrategySeries;
  units: number;
  cost: number;
  entryIndex: number;
  entryDate: string;
  lastClose: number;
  exit: { signalDate: string; reason: string } | null;
}

export function runStockBacktest(
  series: StrategySeries[],
  benchmark: StrategySeries,
  input: StockBacktestInput,
): Omit<StockBacktestResult, 'id' | 'createdAt'> {
  const { settings, startDate, endDate } = input;
  const calendar = benchmark.bars.filter((bar) => bar.date >= startDate && bar.date <= endDate);
  if (calendar.length < 2) throw new Error('区间内至少需要两个完整交易日');
  if (!benchmark.bars.some((bar) => bar.date < startDate)) throw new Error('基准历史不足，请缩短回测区间');
  const calendarBefore = benchmark.bars.filter((bar) => bar.date < startDate).at(-1)!;
  const indexBySymbol = new Map(series.map((item) => [item.symbol, new Map(item.bars.map((bar) => [bar.date, bar]))]));
  const positions = new Map<string, Position>();
  const trades: StrategyTrade[] = [];
  const curve: StrategyEquityPoint[] = [];
  let cash = settings.initialCapital;
  let peak = cash;
  let fees = 0;
  let skippedOrders = 0;
  let staleValuationDays = 0;
  const slip = settings.slippageBps / 10_000;
  for (const [index, day] of calendar.entries()) {
    const previousDate = index === 0 ? calendarBefore.date : calendar[index - 1]!.date;
    const sold = new Set<string>();
    for (const [symbol, position] of positions) {
      if (!position.exit || position.entryDate >= day.date) continue;
      const bars = indexBySymbol.get(symbol)!;
      const bar = bars.get(day.date);
      const previous = position.series.bars.filter((item) => item.date < day.date).at(-1);
      if (openBlocked(symbol, bar, previous, 'sell')) {
        skippedOrders++;
        continue;
      }
      const amount = money(position.units * bar!.open * (1 - slip));
      const fee = strategyFees(amount, 'sell', settings);
      cash = money(cash + amount - fee);
      fees = money(fees + fee);
      trades.push({
        symbol,
        name: position.series.name,
        date: day.date,
        signalDate: position.exit.signalDate,
        side: 'sell',
        price: bar!.rawOpen * (1 - slip),
        quantity: amount / (bar!.rawOpen * (1 - slip)),
        amount,
        fees: fee,
        reason: position.exit.reason,
        pnl: money(amount - fee - position.cost),
      });
      positions.delete(symbol);
      sold.add(symbol);
    }
    const openEquity =
      cash +
      [...positions.values()].reduce(
        (sum, p) => sum + p.units * (indexBySymbol.get(p.series.symbol)?.get(day.date)?.open ?? p.lastClose),
        0,
      );
    const budget = openEquity / settings.topN;
    for (const candidate of rankStocks(series, previousDate, settings)) {
      if (positions.size >= settings.topN) break;
      if (positions.has(candidate.symbol) || sold.has(candidate.symbol)) continue;
      const item = series.find((entry) => entry.symbol === candidate.symbol)!;
      const bars = indexBySymbol.get(candidate.symbol)!;
      const bar = bars.get(day.date);
      if (openBlocked(candidate.symbol, bar, bars.get(previousDate), 'buy')) {
        skippedOrders++;
        continue;
      }
      const price = bar!.rawOpen * (1 + slip);
      const quantity = affordableQuantity(candidate.symbol, price, Math.min(cash, budget), settings);
      if (quantity === 0) {
        skippedOrders++;
        continue;
      }
      const amount = money(price * quantity);
      const fee = strategyFees(amount, 'buy', settings);
      cash = money(cash - amount - fee);
      fees = money(fees + fee);
      positions.set(candidate.symbol, {
        series: item,
        units: amount / (bar!.open * (1 + slip)),
        cost: amount + fee,
        entryIndex: index,
        entryDate: day.date,
        lastClose: bar!.close,
        exit: null,
      });
      trades.push({
        symbol: candidate.symbol,
        name: candidate.name,
        date: day.date,
        signalDate: previousDate,
        side: 'buy',
        price,
        quantity,
        amount,
        fees: fee,
        reason: candidate.reasons.join('；'),
        pnl: null,
      });
    }
    let staleToday = false;
    for (const position of positions.values()) {
      const bar = indexBySymbol.get(position.series.symbol)!.get(day.date);
      if (!bar) {
        staleToday = true;
        continue;
      }
      position.lastClose = bar.close;
      if (position.exit) continue;
      const pnlPercent = ratio(position.units * bar.close, position.cost) * 100;
      const history = position.series.bars.filter((entry) => entry.date <= day.date);
      const ma20 = mean(history.slice(-20).map((entry) => entry.close));
      const reason =
        pnlPercent <= -settings.stopLossPercent
          ? '收盘触发止损'
          : pnlPercent >= settings.takeProfitPercent
            ? '收盘触发止盈'
            : index - position.entryIndex + 1 >= settings.holdingDays
              ? '达到持有期限'
              : bar.close < ma20
                ? '收盘跌破 20 日均线'
                : null;
      if (reason) position.exit = { signalDate: day.date, reason };
    }
    if (staleToday) staleValuationDays++;
    const equity = money(cash + [...positions.values()].reduce((sum, p) => sum + p.units * p.lastClose, 0));
    peak = Math.max(peak, equity);
    curve.push({
      date: day.date,
      equity,
      cash,
      returnPercent: ratio(equity, settings.initialCapital) * 100,
      benchmarkPercent: ratio(day.close, calendar[0]!.open) * 100,
      drawdownPercent: (1 - equity / peak) * 100,
    });
  }
  const last = curve.at(-1)!;
  const sells = trades.filter((trade) => trade.side === 'sell');
  const days = (Date.parse(last.date) - Date.parse(curve[0]!.date)) / 86_400_000 + 1;
  return {
    input,
    universe: series.map(({ symbol, name }) => ({ symbol, name })),
    startDate: curve[0]!.date,
    endDate: last.date,
    totalReturnPercent: last.returnPercent,
    annualizedReturnPercent: days >= 30 ? ((last.equity / settings.initialCapital) ** (365 / days) - 1) * 100 : null,
    benchmarkReturnPercent: last.benchmarkPercent,
    maxDrawdownPercent: Math.max(...curve.map((point) => point.drawdownPercent)),
    winRatePercent: sells.length ? (sells.filter((trade) => trade.pnl! > 0).length / sells.length) * 100 : null,
    closedTrades: sells.length,
    fees,
    finalEquity: last.equity,
    openPositions: positions.size,
    skippedOrders,
    curve,
    trades,
    warnings: [
      ...STOCK_STRATEGY_ASSUMPTIONS,
      ...(staleValuationDays ? [`${staleValuationDays} 个交易日存在缺失持仓行情，沿用最近收盘估值。`] : []),
    ],
  };
}
