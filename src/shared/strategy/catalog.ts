import type { StockStrategyId, StockStrategySettings } from './types';

export const STOCK_STRATEGIES: { id: StockStrategyId; name: string; description: string; rules: string[] }[] = [
  {
    id: 'momentum',
    name: '趋势动量',
    description: '在上升趋势中寻找相对强势股',
    rules: [
      '收盘价 > 20 日均线 > 60 日均线',
      '20 日涨幅为正，距离 20 日均线不超过 15%',
      '按 20 日涨幅 ÷ 20 日收益波动率降序排名',
    ],
  },
  {
    id: 'breakout',
    name: '放量突破',
    description: '寻找成交量确认的价格突破',
    rules: [
      '收盘价突破此前 20 日最高价，且高于 60 日均线',
      '成交量 ≥ 此前 20 日均量的 1.5 倍',
      '按突破幅度 × 100 + 量比降序排名',
    ],
  },
  {
    id: 'pullback',
    name: '趋势回踩',
    description: '在上升趋势中等待缩量回踩',
    rules: [
      '20 日均线 > 60 日均线，60 日涨幅为正',
      '收盘价距 20 日均线在 ±3% 内，当日收涨',
      '量比 ≤ 1.2；按贴近均线程度和 60 日涨幅排名',
    ],
  },
];

export const DEFAULT_STOCK_STRATEGY_SETTINGS: StockStrategySettings = {
  strategyId: 'momentum',
  poolId: 'research',
  symbols: [],
  topN: 5,
  holdingDays: 10,
  stopLossPercent: 8,
  takeProfitPercent: 20,
  initialCapital: 100_000,
  commissionBps: 3,
  minimumCommission: 5,
  stampDutyBps: 5,
  slippageBps: 5,
};

export const STOCK_STRATEGY_ASSUMPTIONS = [
  '固定股票池研究：使用本次选定的股票名单，不含历史退市股或历史成分变化，存在幸存者偏差；不能代表全 A 股表现。',
  '前复权日线计算信号；收盘确认，下一交易日开盘模拟成交。止盈止损也在收盘判断，次日开盘执行。',
  '买入按原始价格计算申报数量；除权分红以复权价格等效再投资，卖出数量可能含理论碎股，未逐笔模拟公司行动。',
  '停牌或缺少日线不成交；开盘接近涨停不买、接近跌停不卖。涨跌停使用板块比例近似，未覆盖历史 ST、特别交易状态及真实排队。',
  '费用参数在整个区间保持不变，佣金口径应包含其他经手费用；不模拟成交容量、盘口、税率历史变化。期末持仓按收盘价估值，不强制平仓。',
];

// A date cutoff, not a holiday calendar. Actual sessions come from index bars.
export function completedStrategyDate(now = new Date()): string {
  const local = new Date(now.getTime() + 8 * 3_600_000);
  if (local.getUTCHours() * 60 + local.getUTCMinutes() < 15 * 60 + 30) local.setUTCDate(local.getUTCDate() - 1);
  return local.toISOString().slice(0, 10);
}
