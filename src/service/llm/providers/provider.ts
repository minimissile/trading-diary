import type { LlmCompletionOptions, LlmCompletionResult, LlmMessage } from '../../../shared/llm/types';

export interface LlmProvider {
  complete(messages: LlmMessage[], options: LlmCompletionOptions): Promise<LlmCompletionResult>;
}
