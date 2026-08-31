import type { KLineBar, KLinePeriod } from '../../../shared/market/types';

function isIntradayPeriod(period: KLinePeriod): boolean {
  return period === '1m' || period === '5m' || period === '15m' || period === '30m' || period === '60m';
}

function periodStepMs(period: KLinePeriod): number {
  switch (period) {
    case '1m':
      return 60_000;
    case '5m':
      return 5 * 60_000;
    case '15m':
      return 15 * 60_000;
    case '30m':
      return 30 * 60_000;
    case '60m':
      return 60 * 60_000;
    case '1d':
      return 86_400_000;
    case '1w':
      return 7 * 86_400_000;
    case '1M':
      return 30 * 86_400_000;
  }
}

/** 将「早于该时间戳」转换为东方财富 K 线 end 参数。 */
export function formatEastMoneyKLineEnd(beforeTimestamp: number | undefined, period: KLinePeriod): string {
  if (beforeTimestamp === undefined) return '20500101';

  const anchor = beforeTimestamp - periodStepMs(period);
  const date = new Date(anchor);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  if (isIntradayPeriod(period)) {
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}${month}${day}${hour}${minute}`;
  }

  return `${year}${month}${day}`;
}

/** 从完整序列中截取 init / forward 请求需要的 K 线段。 */
export function sliceKLineBars(
  bars: KLineBar[],
  limit: number,
  beforeTimestamp?: number,
): { bars: KLineBar[]; hasMoreHistory: boolean } {
  const sorted = [...bars].sort((left, right) => left.timestamp - right.timestamp);
  const pool =
    beforeTimestamp === undefined ? sorted : sorted.filter((bar) => bar.timestamp < beforeTimestamp);

  if (pool.length === 0) {
    return { bars: [], hasMoreHistory: false };
  }

  if (beforeTimestamp === undefined) {
    const slice = pool.slice(-limit);
    return {
      bars: slice,
      hasMoreHistory: pool.length > slice.length || slice.length >= limit,
    };
  }

  const slice = pool.slice(-limit);
  return {
    bars: slice,
    hasMoreHistory: pool.length > slice.length || slice.length >= limit,
  };
}

export function klinePeriodStepMs(period: KLinePeriod): number {
  return periodStepMs(period);
}
