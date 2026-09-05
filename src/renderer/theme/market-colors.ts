/**
 * 中国市场默认使用红涨绿跌。业务方向色不得替代 colorSuccess / colorError，
 * 避免“盈利”和“操作成功”、“亏损”和“操作失败”产生语义冲突。
 */
export const marketColors = {
  profit: '#ff756b',
  profitSurface: 'rgba(255, 117, 107, 0.14)',
  loss: '#8bd66b',
  lossSurface: 'rgba(139, 214, 107, 0.14)',
  flat: '#65739a',
  flatSurface: 'rgba(101, 115, 154, 0.14)',
} as const;

/** 图表默认序列色，顺序经过明度和色相区分，适合深色玻璃画布。 */
export const chartColors = ['#5b8cff', '#8b5cf6', '#39d3c3', '#ffb24a', '#ff5e73', '#56c7ff'] as const;

export type MarketDirection = 'profit' | 'loss' | 'flat';
