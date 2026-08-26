const BLOCKED_PATTERNS = [/强烈建议买入/u, /强烈建议卖出/u, /立即买入/u, /立即卖出/u, /目标价/u, /建议建仓/u, /建议清仓/u];

export function assertOutputPolicy(content: string): void {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(content)) {
      throw new Error('AI 输出包含禁止的买卖建议用语');
    }
  }
}
