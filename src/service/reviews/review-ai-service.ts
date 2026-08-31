import type { AppDatabase } from '../database/database';
import type { CreateTradeReviewInput, TradingPlan } from '../../shared/api.types';
import { PROMPT_IDS } from '../../shared/llm/prompt-id';
import { reviewSummarizeOutputSchema, reviewSummarizeVariablesSchema } from '../../shared/llm/llm.schemas';
import { LlmPolicyViolationError, LlmValidationError } from '../../shared/llm/errors';
import type { LlmRunner } from '../llm/llm-runner';
import { assertOutputPolicy } from '../llm/guards/output-policy';

export interface ReviewAiDraftInput {
  planId: string | null;
  symbol: string;
  title: string;
  direction: CreateTradeReviewInput['direction'];
  planned: boolean;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  fees: number;
  executionScore: number;
  partialSummary?: string;
  partialLesson?: string;
}

export interface ReviewAiDraftResult {
  summary: string;
  lesson: string;
  citations: string[];
}

const directionLabels = { long: '做多', short: '做空' } as const;

function buildPlanContext(plan: TradingPlan | null): string {
  if (!plan) return '';
  return `### 关联计划
- 计划名称：${plan.name}
- 计划逻辑：${plan.thesis}
- 计划入场价：${plan.entryPrice}
- 计划止损价：${plan.stopPrice}
- 计划目标价：${plan.targetPrice ?? '未设置'}`;
}

function buildPartialAnswers(input: ReviewAiDraftInput): string {
  const parts: string[] = [];
  if (input.partialSummary?.trim()) parts.push(`用户已写总结草稿：${input.partialSummary.trim()}`);
  if (input.partialLesson?.trim()) parts.push(`用户已写规则草稿：${input.partialLesson.trim()}`);
  return parts.length ? `### 用户草稿\n${parts.join('\n')}` : '';
}

function parseReviewOutput(raw: string): { summary: string; lesson: string } {
  const jsonText = raw
    .replace(/^```(?:json)?\s*/iu, '')
    .replace(/\s*```$/iu, '')
    .trim();
  try {
    return reviewSummarizeOutputSchema.parse(JSON.parse(jsonText));
  } catch {
    throw new LlmValidationError('AI 返回的复盘草稿格式无效');
  }
}

function buildReviewRenderVars(database: AppDatabase, input: ReviewAiDraftInput): {
  renderVars: Record<string, string>;
  plan: TradingPlan | null;
  variables: ReturnType<typeof reviewSummarizeVariablesSchema.parse>;
} {
  const plan = input.planId ? (database.listTradingPlans().find((item) => item.id === input.planId) ?? null) : null;
  const pnl = (input.exitPrice - input.entryPrice) * input.quantity * (input.direction === 'short' ? -1 : 1) - input.fees;

  const variables = reviewSummarizeVariablesSchema.parse({
    symbol: input.symbol,
    title: input.title,
    direction: input.direction,
    planned: input.planned,
    entryPrice: input.entryPrice,
    exitPrice: input.exitPrice,
    quantity: input.quantity,
    fees: input.fees,
    executionScore: input.executionScore,
    partialSummary: input.partialSummary,
    partialLesson: input.partialLesson,
    pnl,
    planThesis: plan?.thesis,
    planEntryPrice: plan?.entryPrice,
    planStopPrice: plan?.stopPrice,
  });

  const renderVars: Record<string, string> = {
    symbol: variables.symbol,
    title: variables.title,
    directionLabel: directionLabels[variables.direction],
    plannedLabel: variables.planned ? '是' : '否',
    entryPrice: String(variables.entryPrice),
    exitPrice: String(variables.exitPrice),
    quantity: String(variables.quantity),
    fees: String(variables.fees),
    pnl: String(variables.pnl),
    executionScore: String(variables.executionScore),
    planContext: buildPlanContext(plan),
    partialAnswers: buildPartialAnswers(input),
  };

  return { renderVars, plan, variables };
}

function finalizeReviewDraft(
  content: string,
  variables: ReturnType<typeof reviewSummarizeVariablesSchema.parse>,
  plan: TradingPlan | null,
): ReviewAiDraftResult {
  try {
    assertOutputPolicy(content);
  } catch (error) {
    throw new LlmPolicyViolationError(error instanceof Error ? error.message : 'AI 输出未通过合规检查');
  }

  const parsed = parseReviewOutput(content);
  return {
    summary: parsed.summary,
    lesson: parsed.lesson,
    citations: [variables.symbol, ...(plan ? [plan.id] : [])],
  };
}

export async function generateReviewAiDraft(
  database: AppDatabase,
  llmRunner: LlmRunner,
  input: ReviewAiDraftInput,
): Promise<ReviewAiDraftResult> {
  const { renderVars, plan, variables } = buildReviewRenderVars(database, input);
  const result = await llmRunner.run(PROMPT_IDS.REVIEW_SUMMARIZE, renderVars);
  return finalizeReviewDraft(result.content, variables, plan);
}

export async function generateReviewAiDraftStream(
  database: AppDatabase,
  llmRunner: LlmRunner,
  input: ReviewAiDraftInput,
  handlers: { onChunk: (delta: string) => void; streamId: string },
): Promise<ReviewAiDraftResult> {
  const { renderVars, plan, variables } = buildReviewRenderVars(database, input);
  const result = await llmRunner.runStream(PROMPT_IDS.REVIEW_SUMMARIZE, renderVars, handlers.onChunk, handlers.streamId);
  return finalizeReviewDraft(result.content, variables, plan);
}
