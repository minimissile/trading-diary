import type { LlmCompletionOptions, LlmCompletionResult, LlmMessage } from '../../../shared/llm/types';

export interface LlmStreamHandlers {
  onChunk: (delta: string) => void;
  signal?: AbortSignal;
}

export interface LlmProvider {
  complete(messages: LlmMessage[], options: LlmCompletionOptions): Promise<LlmCompletionResult>;
  completeStream(messages: LlmMessage[], options: LlmCompletionOptions, handlers: LlmStreamHandlers): Promise<LlmCompletionResult>;
}
