export type DividendGoalKind = 'ytd' | 'daily';

/** 按账户保存的分红目标，累计与日均可同时设置。 */
export interface DividendGoalSettings {
  ytdTarget: number | null;
  dailyTarget: number | null;
}

/** 分红目标进度视图，供页面展示当前值与目标值对比。 */
export interface DividendGoalProgressView {
  kind: DividendGoalKind;
  kindLabel: string;
  currentAmount: number;
  targetAmount: number;
  progress: number;
  progressPercent: number;
  remaining: number;
  reached: boolean;
  year: number;
}

interface LegacyDividendGoalSettings {
  enabled?: boolean;
  kind: DividendGoalKind;
  targetAmount: number;
}

/**
 * 生成分红目标在偏好存储中的键名。
 * @param accountId 账户 ID，含全部账户汇总 ID
 */
export function dividendGoalStorageKey(accountId: string): string {
  return `dividend_goal:${accountId}`;
}

/**
 * 判断账户是否配置了至少一个有效目标。
 * @param settings 分红目标设置
 */
export function hasDividendGoal(settings: DividendGoalSettings | null | undefined): boolean {
  return (settings?.ytdTarget ?? 0) > 0 || (settings?.dailyTarget ?? 0) > 0;
}

/**
 * 规范化存储中的分红目标，兼容旧版单目标结构。
 * @param raw 数据库读取的原始 JSON
 */
export function normalizeDividendGoalSettings(raw: unknown): DividendGoalSettings | null {
  if (!raw || typeof raw !== 'object') return null;

  const record = raw as Record<string, unknown>;
  if ('kind' in record && 'targetAmount' in record) {
    const legacy = record as LegacyDividendGoalSettings;
    if (legacy.enabled === false || legacy.targetAmount <= 0) return null;
    return legacy.kind === 'daily'
      ? { ytdTarget: null, dailyTarget: legacy.targetAmount }
      : { ytdTarget: legacy.targetAmount, dailyTarget: null };
  }

  const ytdTarget = sanitizeTargetAmount(record.ytdTarget);
  const dailyTarget = sanitizeTargetAmount(record.dailyTarget);
  if (ytdTarget === null && dailyTarget === null) return null;
  return { ytdTarget, dailyTarget };
}

/**
 * 根据当前统计计算全部分红目标进度。
 * @param settings 分红目标设置
 * @param input 当前分红统计
 */
export function computeDividendGoalProgressList(
  settings: DividendGoalSettings | null | undefined,
  input: { ytdReceived: number; dailyAverage: number; year: number },
): DividendGoalProgressView[] {
  const normalized = settings ? normalizeDividendGoalSettings(settings) : null;
  if (!normalized) return [];

  const items: DividendGoalProgressView[] = [];
  if (normalized.ytdTarget !== null) {
    items.push(buildDividendGoalProgress('ytd', normalized.ytdTarget, input));
  }
  if (normalized.dailyTarget !== null) {
    items.push(buildDividendGoalProgress('daily', normalized.dailyTarget, input));
  }
  return items;
}

function sanitizeTargetAmount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function buildDividendGoalProgress(
  kind: DividendGoalKind,
  targetAmount: number,
  input: { ytdReceived: number; dailyAverage: number; year: number },
): DividendGoalProgressView {
  const currentAmount = kind === 'daily' ? input.dailyAverage : input.ytdReceived;
  const progress = targetAmount > 0 ? currentAmount / targetAmount : 0;

  return {
    kind,
    kindLabel: kind === 'daily' ? '日均分红' : '今年累计分红',
    currentAmount,
    targetAmount,
    progress,
    progressPercent: Math.min(progress * 100, 999),
    remaining: Math.max(targetAmount - currentAmount, 0),
    reached: currentAmount >= targetAmount,
    year: input.year,
  };
}
