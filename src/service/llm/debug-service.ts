import type { PromptId } from '../../shared/llm/prompt-id';
import type { LlmDebugRunResult, LlmPromptPreview } from '../../shared/llm/types';
import type { LlmRunner } from './llm-runner';

export function previewPrompt(
  llmRunner: LlmRunner,
  promptId: PromptId,
  variables: Record<string, string>,
): LlmPromptPreview {
  return llmRunner.previewPrompt(promptId, variables);
}

export async function debugRunStream(
  llmRunner: LlmRunner,
  promptId: PromptId,
  variables: Record<string, string>,
  handlers: { onChunk: (delta: string) => void; streamId: string },
): Promise<LlmDebugRunResult> {
  const result = await llmRunner.runStream(promptId, variables, handlers.onChunk, handlers.streamId);
  return {
    content: result.content,
    model: result.model,
    promptId: result.promptId,
    promptVersion: result.promptVersion,
    latencyMs: result.latencyMs,
    usage: result.usage,
  };
}
