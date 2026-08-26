import { PROMPT_IDS } from '../../../shared/llm/prompt-id';
import { LlmProviderError } from '../../../shared/llm/errors';
import type { LlmCompletionOptions, LlmCompletionResult, LlmMessage } from '../../../shared/llm/types';
import type { LlmProvider } from './provider';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

interface OpenRouterProviderOptions {
  getApiKey: () => string | null;
  defaultModel: string;
  fallbackModels: string[];
  timeoutMs: number;
  referer?: string;
  title?: string;
}

function isRetryableError(status: number, detail: string): boolean {
  if (status === 429) return true;
  if (status !== 403) return false;
  return /not available in your region|region|country|blocked/i.test(detail);
}

function isJsonModeError(status: number, detail: string): boolean {
  return status === 400 || status === 422 || /response_format|json_object|structured output/i.test(detail);
}

export class OpenRouterProvider implements LlmProvider {
  private readonly getApiKey: () => string | null;
  private readonly defaultModel: string;
  private readonly fallbackModels: string[];
  private readonly timeoutMs: number;
  private readonly referer: string;
  private readonly title: string;

  constructor(options: OpenRouterProviderOptions) {
    this.getApiKey = options.getApiKey;
    this.defaultModel = options.defaultModel;
    this.fallbackModels = options.fallbackModels;
    this.timeoutMs = options.timeoutMs;
    this.referer = options.referer ?? 'https://github.com/minimissile/trading-diary';
    this.title = options.title ?? 'Trading Diary';
  }

  async complete(messages: LlmMessage[], options: LlmCompletionOptions): Promise<LlmCompletionResult> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new LlmProviderError('OpenRouter API Key 未配置');
    }

    const preferred = options.model ?? this.defaultModel;
    const models = [preferred, ...(options.fallbackModels ?? this.fallbackModels).filter((model) => model !== preferred)];
    const wantJson = options.responseFormat === 'json';
    let lastError: Error | null = null;
    const startedAt = Date.now();

    for (const model of models) {
      const jsonModes = wantJson ? [true, false] : [false];

      for (const useJson of jsonModes) {
        const body: Record<string, unknown> = {
          model,
          messages,
          temperature: options.temperature ?? 0.2,
        };

        if (options.maxTokens) body.max_tokens = options.maxTokens;
        if (useJson) body.response_format = { type: 'json_object' };

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? this.timeoutMs);

        try {
          const response = await fetch(OPENROUTER_API_URL, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': options.referer ?? this.referer,
              'X-Title': options.title ?? this.title,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          });

          if (response.ok) {
            const payload = (await response.json()) as {
              choices?: Array<{ message?: { content?: string } }>;
              usage?: { prompt_tokens?: number; completion_tokens?: number };
            };
            const content = payload.choices?.[0]?.message?.content?.trim();
            if (!content) throw new LlmProviderError('OpenRouter 返回空内容');

            return {
              content,
              promptId: options.promptId ?? PROMPT_IDS.RELEASE_NOTES,
              promptVersion: options.promptVersion ?? 0,
              model,
              usage:
                payload.usage?.prompt_tokens !== undefined
                  ? {
                      inputTokens: payload.usage.prompt_tokens,
                      outputTokens: payload.usage.completion_tokens ?? 0,
                    }
                  : undefined,
              latencyMs: Date.now() - startedAt,
            };
          }

          const detail = await response.text();
          lastError = new LlmProviderError(`OpenRouter 请求失败 (${response.status}, ${model})：${detail}`, response.status);

          if (useJson && isJsonModeError(response.status, detail)) continue;
          if (isRetryableError(response.status, detail)) break;
          throw lastError;
        } catch (error) {
          if (error instanceof LlmProviderError) {
            lastError = error;
            if (error.status && isRetryableError(error.status, error.message)) break;
            throw error;
          }
          if (error instanceof Error && error.name === 'AbortError') {
            throw new LlmProviderError('OpenRouter 请求超时');
          }
          throw error;
        } finally {
          clearTimeout(timer);
        }
      }
    }

    throw lastError ?? new LlmProviderError('OpenRouter 无可用模型');
  }
}
