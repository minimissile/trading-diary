import { PROMPT_IDS, type PromptId } from '../../../shared/llm/prompt-id';
import type { LlmCompletionOptions, LlmCompletionResult, LlmMessage } from '../../../shared/llm/types';
import type { LlmProvider } from './provider';

export class MockProvider implements LlmProvider {
  private readonly fixtures: Partial<Record<PromptId, string>>;
  private readonly latencyMs: number;

  constructor(fixtures: Partial<Record<PromptId, string>>, latencyMs = 1) {
    this.fixtures = fixtures;
    this.latencyMs = latencyMs;
  }

  async complete(messages: LlmMessage[], options: LlmCompletionOptions): Promise<LlmCompletionResult> {
    void messages;
    await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    const promptId = options.promptId ?? PROMPT_IDS.RELEASE_NOTES;
    const content = this.fixtures[promptId] ?? `[mock:${promptId}]`;
    return {
      content,
      promptId,
      promptVersion: 1,
      model: 'mock/model',
      latencyMs: this.latencyMs,
    };
  }
}
