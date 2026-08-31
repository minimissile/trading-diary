import type { FundSipOccurrence, FundSipPlan, SipOccurrenceCalendarDay, SipOccurrenceStatus } from '../../shared/sip/types';

const TERMINAL_STATUSES: SipOccurrenceStatus[] = ['completed', 'skipped', 'missed'];

/** 计算定投纪律率：已完成 / (已完成 + 跳过 + 逾期)。 */
export function computeDisciplineRate(occurrences: Pick<FundSipOccurrence, 'status'>[]): number | null {
  const completed = occurrences.filter((item) => item.status === 'completed').length;
  const denominator = occurrences.filter((item) => TERMINAL_STATUSES.includes(item.status)).length;
  if (denominator === 0) return null;
  return completed / denominator;
}

/** 从最近一期向前统计连续完成期数。 */
export function computeCurrentStreak(
  occurrences: Pick<FundSipOccurrence, 'status' | 'scheduledDate'>[],
): number {
  const sorted = [...occurrences]
    .filter((item) => TERMINAL_STATUSES.includes(item.status))
    .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));

  let streak = 0;
  for (const item of sorted) {
    if (item.status !== 'completed') break;
    streak += 1;
  }
  return streak;
}

/** 统计历史最长连续完成期数。 */
export function computeLongestStreak(
  occurrences: Pick<FundSipOccurrence, 'status' | 'scheduledDate'>[],
): number {
  const sorted = [...occurrences]
    .filter((item) => TERMINAL_STATUSES.includes(item.status))
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

  let longest = 0;
  let current = 0;
  for (const item of sorted) {
    if (item.status === 'completed') {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

/** 汇总计划期次统计。 */
export function summarizePlanOccurrences(occurrences: Pick<FundSipOccurrence, 'status' | 'scheduledDate'>[]): {
  completedCount: number;
  skippedCount: number;
  missedCount: number;
  dueCount: number;
  nextScheduledDate: string | null;
  lastCompletedDate: string | null;
  currentStreak: number;
  disciplineRate: number | null;
} {
  const today = new Date().toISOString().slice(0, 10);
  const completed = occurrences.filter((item) => item.status === 'completed');
  const completedCount = completed.length;
  const skippedCount = occurrences.filter((item) => item.status === 'skipped').length;
  const missedCount = occurrences.filter((item) => item.status === 'missed').length;
  const dueCount = occurrences.filter((item) => item.status === 'due').length;
  const nextScheduledDate =
    occurrences
      .filter((item) => item.status === 'scheduled' && item.scheduledDate >= today)
      .map((item) => item.scheduledDate)
      .sort()[0] ?? null;
  const lastCompletedDate =
    completed
      .map((item) => item.scheduledDate)
      .sort()
      .at(-1) ?? null;

  return {
    completedCount,
    skippedCount,
    missedCount,
    dueCount,
    nextScheduledDate,
    lastCompletedDate,
    currentStreak: computeCurrentStreak(occurrences),
    disciplineRate: computeDisciplineRate(occurrences),
  };
}

/** 计算全部活跃计划的累计投入（已确认期次金额之和）。 */
export function computeTotalInvested(
  plans: Pick<FundSipPlan, 'id'>[],
  occurrences: Pick<FundSipOccurrence, 'planId' | 'status' | 'amount'>[],
): number {
  const planIds = new Set(plans.map((plan) => plan.id));
  return occurrences
    .filter((item) => planIds.has(item.planId) && item.status === 'completed')
    .reduce((sum, item) => sum + (item.amount ?? 0), 0);
}

/** 统计当月已完成期次数。 */
export function countCompletedThisMonth(
  occurrences: Pick<FundSipOccurrence, 'status' | 'confirmedAt' | 'scheduledDate'>[],
  yearMonth: string,
): number {
  return occurrences.filter((item) => {
    if (item.status !== 'completed') return false;
    const date = (item.confirmedAt ?? item.scheduledDate).slice(0, 7);
    return date === yearMonth;
  }).length;
}

/** 构建月历视图数据。 */
export function buildOccurrenceCalendar(
  month: string,
  occurrences: Array<
    Pick<FundSipOccurrence, 'id' | 'planId' | 'scheduledDate' | 'status' | 'amount'> & {
      planName: string;
      symbol: string;
      plannedAmount: number;
    }
  >,
): SipOccurrenceCalendarDay[] {
  const prefix = month.slice(0, 7);
  const dayMap = new Map<string, SipOccurrenceCalendarDay['items']>();

  for (const item of occurrences) {
    if (!item.scheduledDate.startsWith(prefix)) continue;
    const entry = {
      occurrenceId: item.id,
      planId: item.planId,
      planName: item.planName,
      symbol: item.symbol,
      amount: item.amount ?? item.plannedAmount,
      status: item.status,
    };
    const bucket = dayMap.get(item.scheduledDate) ?? [];
    bucket.push(entry);
    dayMap.set(item.scheduledDate, bucket);
  }

  return [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({ date, items }));
}

/** 生成定投周期复盘模板（季度/月度自检）。 */
export function buildSipReviewTemplate(
  plan: Pick<FundSipPlan, 'name' | 'symbol' | 'thesis' | 'amount' | 'frequency'>,
  stats: ReturnType<typeof summarizePlanOccurrences>,
  position?: { quantity: number; avgCost: number; unrealizedPnl: number | null },
): {
  symbol: string;
  title: string;
  summary: string;
  lesson: string;
  entryPrice: number;
  quantity: number;
  fees: number;
} {
  const discipline =
    stats.disciplineRate === null ? '暂无足够期次' : `${Math.round(stats.disciplineRate * 100)}%`;
  const positionLine = position
    ? `当前持仓 ${position.quantity.toFixed(2)} 份，成本 ${position.avgCost.toFixed(4)}${
        position.unrealizedPnl === null ? '' : `，浮盈 ${position.unrealizedPnl >= 0 ? '+' : ''}${position.unrealizedPnl.toFixed(2)}`
      }。`
    : '当前暂无对应持仓记录。';

  const summary = [
    `【定投计划】${plan.name}（${plan.symbol}）`,
    `【执行纪律】已完成 ${stats.completedCount} 期，跳过 ${stats.skippedCount} 期，逾期 ${stats.missedCount} 期，纪律率 ${discipline}，连续完成 ${stats.currentStreak} 期。`,
    `【初始逻辑】${plan.thesis}`,
    `【持仓现状】${positionLine}`,
    '',
    '【本期检视】',
    '1. 标的逻辑是否仍然成立？',
    '2. 执行纪律是否达标？如有跳过/逾期，原因是什么？',
    '3. 是否需要调整每期金额或频率？',
  ].join('\n');

  const lesson = [
    '【经验沉淀】',
    '- 做对了什么：',
    '- 需要改进：',
    '- 下一步行动（继续 / 暂停 / 调整金额）：',
  ].join('\n');

  return {
    symbol: plan.symbol,
    title: `${plan.name} · 定投周期复盘`,
    summary,
    lesson,
    entryPrice: position?.avgCost ?? 0,
    quantity: position?.quantity ?? 0,
    fees: 0,
  };
}
