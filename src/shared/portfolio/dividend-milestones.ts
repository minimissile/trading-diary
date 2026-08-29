import type { MilestoneDefinition, MilestoneState } from './types';

export const DIVIDEND_MILESTONES: readonly MilestoneDefinition[] = [
  { id: 'egg', threshold: 1, emoji: '🥚', name: '一颗鸡蛋', caption: '够买一颗新鲜鸡蛋（约 ¥1）' },
  { id: 'tofu', threshold: 5, emoji: '🧈', name: '一块豆腐', caption: '够买一块嫩豆腐（约 ¥3–6）' },
  { id: 'greens', threshold: 10, emoji: '🥬', name: '一把青菜', caption: '够买一把时令青菜（约 ¥5–12）' },
  { id: 'meal', threshold: 20, emoji: '🍱', name: '一顿简餐', caption: '够一份工地盒饭或连锁快餐' },
  { id: 'oil', threshold: 50, emoji: '🫙', name: '一桶油', caption: '够买 2.5L 品牌食用油' },
  { id: 'rice', threshold: 100, emoji: '🍚', name: '一袋大米', caption: '够买 10kg 普通大米' },
  { id: 'milk', threshold: 200, emoji: '🥛', name: '一箱奶', caption: '够买一箱纯牛奶（12 盒装）' },
  { id: 'quilt', threshold: 500, emoji: '🛏️', name: '一床夏被', caption: '够买一床透气夏凉被' },
  { id: 'pot', threshold: 1_000, emoji: '🍳', name: '一口锅', caption: '够买一口涂层不粘锅' },
  { id: 'phone', threshold: 2_000, emoji: '📱', name: '一部入门机', caption: '够买一部千元级智能手机' },
  { id: 'ac', threshold: 5_000, emoji: '❄️', name: '一台空调', caption: '够买一台 1.5 匹壁挂空调（含安装）' },
  { id: 'trip', threshold: 10_000, emoji: '🧳', name: '短途旅行', caption: '够一次周边城市双人周末游' },
  { id: 'scooter', threshold: 20_000, emoji: '🛵', name: '一辆电摩', caption: '够买一辆合规电动摩托车' },
  { id: 'appliances', threshold: 50_000, emoji: '📺', name: '家电套装', caption: '够配齐冰箱、洗衣机、电视' },
  { id: 'renovation', threshold: 100_000, emoji: '🛁', name: '厨卫翻新', caption: '够覆盖一次厨卫局部翻新' },
  { id: 'sedan', threshold: 200_000, emoji: '🚗', name: '一辆家轿', caption: '够买一辆经济型家用车' },
  { id: 'apartment', threshold: 500_000, emoji: '🏘️', name: '一套小户', caption: '够三四线城市一套小户型首付' },
  { id: 'million', threshold: 1_000_000, emoji: '🏆', name: '百万分红', caption: '累计分红突破一百万' },
];

/**
 * 计算各里程碑的点亮与进度状态。
 * @param ytdReceived 当年已确认累计分红（元）
 */
export function computeMilestoneStates(ytdReceived: number): MilestoneState[] {
  return DIVIDEND_MILESTONES.map((milestone) => ({
    ...milestone,
    lit: ytdReceived >= milestone.threshold,
    progress: Math.min(Math.max(ytdReceived / milestone.threshold, 0), 1),
  }));
}

/**
 * 统计已点亮的里程碑数量。
 * @param ytdReceived 当年已确认累计分红（元）
 */
export function countLitMilestones(ytdReceived: number): number {
  return DIVIDEND_MILESTONES.filter((m) => ytdReceived >= m.threshold).length;
}
