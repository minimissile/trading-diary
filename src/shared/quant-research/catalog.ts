import type { QuantRuleId, QuantSettings, QuantSignalDirection } from './types';

export const QUANT_RULES: Array<{
  id: QuantRuleId;
  name: string;
  category: 'technical' | 'pattern';
  direction: QuantSignalDirection;
  description: string;
}> = [
  {
    id: 'new_high',
    name: '区间新高',
    category: 'technical',
    direction: 'strength',
    description: '收盘价高于此前 N 个交易日的最高价，不含信号当日。',
  },
  {
    id: 'new_low',
    name: '区间新低',
    category: 'technical',
    direction: 'weakness',
    description: '收盘价低于此前 N 个交易日的最低价，不含信号当日。',
  },
  {
    id: 'ma_cross_up',
    name: '上穿均线',
    category: 'technical',
    direction: 'strength',
    description: '前一日收盘不高于当日均线，信号日收盘高于当日均线。',
  },
  {
    id: 'ma_cross_down',
    name: '下穿均线',
    category: 'technical',
    direction: 'weakness',
    description: '前一日收盘不低于当日均线，信号日收盘低于当日均线。',
  },
  {
    id: 'volume_surge',
    name: '成交量异动',
    category: 'technical',
    direction: 'activity',
    description: '成交量达到此前 20 个交易日平均成交量的指定倍数，不含信号当日。',
  },
  {
    id: 'bullish_engulfing',
    name: '阳包阴',
    category: 'pattern',
    direction: 'strength',
    description: '前阴后阳，后一日实体完全覆盖前一日实体，至少一端严格超出。不附加趋势判断。',
  },
  {
    id: 'bearish_engulfing',
    name: '阴包阳',
    category: 'pattern',
    direction: 'weakness',
    description: '前阳后阴，后一日实体完全覆盖前一日实体，至少一端严格超出。不附加趋势判断。',
  },
  {
    id: 'upper_shadow',
    name: '长上影',
    category: 'pattern',
    direction: 'weakness',
    description: '上影线至少为实体的 2 倍且占振幅 60%；实体至少占振幅 5%，排除十字线。',
  },
];

export const DEFAULT_QUANT_SETTINGS: QuantSettings = {
  poolId: 'personal',
  symbols: [],
  rules: ['new_high', 'ma_cross_up', 'volume_surge', 'bullish_engulfing', 'upper_shadow'],
  lookback: 60,
  maPeriod: 20,
  volumeMultiple: 2,
  recentDays: 5,
};

export const QUANT_DIRECTION_LABELS: Record<QuantSignalDirection, string> = {
  strength: '走强形态',
  weakness: '走弱形态',
  activity: '量能变化',
};

/** 截止日不是交易日历，实际信号窗口由指数日线确定。 */
export function quantCompletedDate(now = new Date()): string {
  const china = new Date(now.getTime() + 8 * 3_600_000);
  if (china.getUTCHours() * 60 + china.getUTCMinutes() < 15 * 60 + 30) china.setUTCDate(china.getUTCDate() - 1);
  return china.toISOString().slice(0, 10);
}
