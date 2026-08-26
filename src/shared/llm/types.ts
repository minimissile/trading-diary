import type { PromptId } from './prompt-id';

export type LlmMessageRole = 'system' | 'user' | 'assistant';

export interface LlmMessage {
  role: LlmMessageRole;
  content: string;
}

export type LlmResponseFormat = 'markdown' | 'json' | 'text';

export interface PromptDefinition {
  id: PromptId;
  version: number;
  description: string;
  model?: string;
  fallbackModels: string[];
  temperature: number;
  maxTokens: number;
  responseFormat: LlmResponseFormat;
  systemTemplate: string;
  userTemplate: string;
}

export interface LlmCompletionOptions {
  promptId?: PromptId;
  promptVersion?: number;
  model?: string;
  fallbackModels?: string[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: LlmResponseFormat;
  timeoutMs?: number;
  referer?: string;
  title?: string;
}

export interface LlmCompletionResult {
  content: string;
  promptId: PromptId;
  promptVersion: number;
  model: string;
  usage?: { inputTokens: number; outputTokens: number };
  latencyMs: number;
}

export interface LlmConnectionTestResult {
  ok: boolean;
  model: string;
  latencyMs: number;
}
