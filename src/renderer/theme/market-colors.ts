/**
 * 中国市场默认使用红涨绿跌。业务方向色不得替代 colorSuccess / colorError，
 * 避免“盈利”和“操作成功”、“亏损”和“操作失败”产生语义冲突。
 */
export const marketColors = {
  profit: '#c23d4b',
  profitSurface: '#fff1f2',
  loss: '#16845b',
  lossSurface: '#edf8f3',
  flat: '#6b7280',
  flatSurface: '#f1f3f5',
} as const;

/** 图表默认序列色，顺序经过明度和色相区分，适合浅色画布。 */
export const chartColors = ['#2f5bd7', '#16845b', '#c23d4b', '#b76e14', '#6d54c7', '#168099'] as const;

export type MarketDirection = 'profit' | 'loss' | 'flat';
