/** 全局 Prompt 标识符，与 src/prompts 下 .prompt.md 的 frontmatter id 一致。 */
export const PROMPT_IDS = {
  REVIEW_SUMMARIZE: 'review.summarize',
  RELEASE_NOTES: 'release.notes',
  RELEASE_PLAN: 'release.plan',
} as const;

export type PromptId = (typeof PROMPT_IDS)[keyof typeof PROMPT_IDS];
