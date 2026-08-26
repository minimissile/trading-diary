import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PromptId } from '../../shared/llm/prompt-id';
import { LlmNotConfiguredError } from '../../shared/llm/errors';
import type { LlmCompletionResult } from '../../shared/llm/types';
import { assertOutputPolicy } from './guards/output-policy';
import { PromptLoader } from './prompt-loader';
import type { LlmProvider } from './providers/provider';
import { OpenRouterProvider } from './providers/openrouter';
import { CredentialStore } from './credential-store';

interface LlmDefaults {
  defaultModel: string;
  fallbackModels: string[];
  timeoutMs: number;
  maxRetries: number;
}

function loadDefaults(): LlmDefaults {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(moduleDir, 'config', 'llm.defaults.json'),
    path.join(process.cwd(), 'config', 'llm.defaults.json'),
    path.join(process.cwd(), 'out', 'service', 'config', 'llm.defaults.json'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return JSON.parse(fs.readFileSync(candidate, 'utf8')) as LlmDefaults;
    }
  }

  return {
    defaultModel: '~deepseek/deepseek-v4-flash-latest',
    fallbackModels: ['deepseek/deepseek-v4-flash-0731', 'qwen/qwen-plus', 'qwen/qwen3-32b'],
    timeoutMs: 60_000,
    maxRetries: 2,
  };
}

export class LlmRunner {
  private provider: LlmProvider;
  private readonly promptLoader: PromptLoader;
  private readonly credentialStore: CredentialStore | null;
  private readonly defaults: LlmDefaults;
  private readonly enforcePolicy: boolean;

  constructor(options: { dataDir?: string; promptsDir?: string; provider?: LlmProvider; enforcePolicy?: boolean }) {
    this.defaults = loadDefaults();
    this.promptLoader = new PromptLoader(options.promptsDir);
    this.credentialStore = options.dataDir ? new CredentialStore(options.dataDir) : null;
    this.enforcePolicy = options.enforcePolicy ?? true;

    this.provider =
      options.provider ??
      new OpenRouterProvider({
        getApiKey: () => this.credentialStore?.getApiKey() ?? process.env.OPENROUTER_API_KEY?.trim() ?? null,
        defaultModel: this.defaults.defaultModel,
        fallbackModels: this.defaults.fallbackModels,
        timeoutMs: this.defaults.timeoutMs,
      });
  }

  useProvider(provider: LlmProvider): void {
    this.provider = provider;
  }

  getCredentialStore(): CredentialStore | null {
    return this.credentialStore;
  }

  async run(promptId: PromptId, variables: Record<string, string>): Promise<LlmCompletionResult> {
    if (this.provider instanceof OpenRouterProvider) {
      const apiKey = this.credentialStore?.getApiKey() ?? process.env.OPENROUTER_API_KEY?.trim() ?? null;
      if (!apiKey) throw new LlmNotConfiguredError();
    }

    const { system, user, definition } = this.promptLoader.render(promptId, variables);
    const messages = [
      { role: 'system' as const, content: system },
      { role: 'user' as const, content: user },
    ];

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.defaults.maxRetries; attempt += 1) {
      try {
        const result = await this.provider.complete(messages, {
          promptId,
          promptVersion: definition.version,
          model: definition.model,
          fallbackModels: definition.fallbackModels,
          temperature: definition.temperature,
          maxTokens: definition.maxTokens,
          responseFormat: definition.responseFormat,
          timeoutMs: this.defaults.timeoutMs,
        });

        if (this.enforcePolicy && promptId !== 'release.notes' && promptId !== 'release.plan') {
          assertOutputPolicy(result.content);
        }

        return {
          ...result,
          promptId,
          promptVersion: definition.version,
        };
      } catch (error: unknown) {
        lastError = error;
      }
    }

    throw lastError;
  }

  async testConnection(): Promise<{ ok: boolean; model: string; latencyMs: number }> {
    const apiKey = this.credentialStore?.getApiKey() ?? process.env.OPENROUTER_API_KEY?.trim() ?? null;
    if (!apiKey) throw new LlmNotConfiguredError();

    const result = await this.provider.complete(
      [
        { role: 'system', content: '你是连接测试助手，只回复 OK。' },
        { role: 'user', content: 'ping' },
      ],
      {
        model: this.defaults.defaultModel,
        fallbackModels: this.defaults.fallbackModels,
        temperature: 0,
        maxTokens: 8,
        timeoutMs: this.defaults.timeoutMs,
      },
    );

    return { ok: true, model: result.model, latencyMs: result.latencyMs };
  }
}

export function createLlmRunner(dataDir?: string, promptsDir?: string): LlmRunner {
  return new LlmRunner({ dataDir, promptsDir });
}
