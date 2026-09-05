const BLOCKED_PATTERNS = [
  /强烈建议买入/u,
  /强烈建议卖出/u,
  /立即买入/u,
  /立即卖出/u,
  /(?:建议|推荐).{0,12}目标价/u,
  /目标价(?:为|是|设为|设在|定为|看到|看至|看向)/u,
  /建议建仓/u,
  /建议清仓/u,
];

export function assertOutputPolicy(content: string): void {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(content)) {
      throw new Error('AI 输出包含禁止的买卖建议用语');
    }
  }
}
