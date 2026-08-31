import type { LofArbitragePath } from './types';

/** 无可行路径时的操作建议文案。 */
export function summarizeActionHint(
  premiumRate: number | null,
  paths: LofArbitragePath[],
  recommended: LofArbitragePath | null,
): string {
  if (recommended) {
    return recommended.label;
  }
  if (premiumRate === null) {
    return '数据不足';
  }
  if (premiumRate > 0) {
    const blockers = paths.find((path) => path.kind === 'premium_exchange_subscribe')?.blockers ?? [];
    if (blockers.includes('暂停申购，溢价套利不可执行')) {
      return '高溢价但暂停申购 · 勿追';
    }
    return '溢价不足或扣费后无利';
  }
  if (premiumRate < 0) {
    return '折价但未达操作阈值';
  }
  return '暂无套利空间';
}
