import type { PromptId } from './prompt-id';

export type LlmMessageRole = 'system' | 'user' | 'assistant';

export type LlmContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export type LlmMessageContent = string | LlmContentPart[];

export interface LlmMessage {
  role: LlmMessageRole;
  content: LlmMessageContent;
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

export interface LlmStreamChunk {
  streamId: string;
  type: 'chunk';
  delta: string;
}

export interface LlmStreamDone<T = unknown> {
  streamId: string;
  type: 'done';
  result: T;
}

export interface LlmStreamError {
  streamId: string;
  type: 'error';
  code: string;
  message: string;
}

export type LlmStreamEvent<T = unknown> = LlmStreamChunk | LlmStreamDone<T> | LlmStreamError;

export interface LlmUsageRecord {
  id: string;
  timestamp: string;
  promptId: PromptId;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface LlmUsageSummary {
  month: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  requestCount: number;
  monthlyTokenBudget: number | null;
  budgetRemaining: number | null;
  budgetExceeded: boolean;
  recentRecords: LlmUsageRecord[];
}

export interface LlmUserSettings {
  monthlyTokenBudget: number | null;
  debugLogging: boolean;
}

export interface LlmPromptPreview {
  promptId: PromptId;
  promptVersion: number;
  system: string;
  user: string;
}

export interface LlmDebugRunResult {
  content: string;
  model: string;
  promptId: PromptId;
  promptVersion: number;
  latencyMs: number;
  usage?: { inputTokens: number; outputTokens: number };
}
