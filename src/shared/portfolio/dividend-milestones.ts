import type { MilestoneDefinition, MilestoneState } from './types';

export const DIVIDEND_MILESTONES: readonly MilestoneDefinition[] = [
  { id: 'egg', threshold: 1, emoji: '🥚', name: '一颗鸡蛋', caption: '今天的分红，够买一颗鸡蛋' },
  { id: 'tofu', threshold: 5, emoji: '🧈', name: '一块豆腐', caption: '够买一块嫩豆腐' },
  { id: 'greens', threshold: 10, emoji: '🥬', name: '一把青菜', caption: '够买一把时令青菜' },
  { id: 'meal', threshold: 20, emoji: '🍱', name: '一顿简餐', caption: '够一份工地盒饭' },
  { id: 'oil', threshold: 50, emoji: '🛢', name: '一桶油', caption: '够买一小桶食用油' },
  { id: 'rice', threshold: 100, emoji: '🍚', name: '一袋大米', caption: '够买 5kg 大米' },
  { id: 'milk', threshold: 200, emoji: '🥛', name: '一箱奶', caption: '够买一箱纯牛奶' },
  { id: 'quilt', threshold: 500, emoji: '🛏', name: '一床被褥', caption: '够买一床夏被' },
  { id: 'pot', threshold: 1_000, emoji: '🍲', name: '一口锅', caption: '够买一口不粘锅' },
  { id: 'phone', threshold: 2_000, emoji: '📱', name: '一部入门机', caption: '够买一部备用手机' },
  { id: 'ac', threshold: 5_000, emoji: '❄️', name: '一台空调', caption: '够买一台入门空调' },
  { id: 'trip', threshold: 10_000, emoji: '🧳', name: '短途旅行', caption: '够一次周边双人游' },
  { id: 'scooter', threshold: 20_000, emoji: '🛵', name: '一辆电动车', caption: '够买一辆代步电动车' },
  { id: 'appliances', threshold: 50_000, emoji: '🏠', name: '家电套装', caption: '够配齐基础家电' },
  { id: 'renovation', threshold: 100_000, emoji: '🏡', name: '装修基金', caption: '够覆盖一项硬装支出' },
];

export function computeMilestoneStates(ytdReceived: number): MilestoneState[] {
  return DIVIDEND_MILESTONES.map((milestone) => ({
    ...milestone,
    lit: ytdReceived >= milestone.threshold,
    progress: Math.min(Math.max(ytdReceived / milestone.threshold, 0), 1),
  }));
}

export function countLitMilestones(ytdReceived: number): number {
  return DIVIDEND_MILESTONES.filter((m) => ytdReceived >= m.threshold).length;
}
