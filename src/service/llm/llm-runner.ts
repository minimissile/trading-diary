import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PromptId } from '../../shared/llm/prompt-id';
import { LlmNotConfiguredError } from '../../shared/llm/errors';
import type { LlmCompletionResult, LlmContentPart, LlmPromptPreview, LlmUsageSummary, LlmUserSettings, PromptDefinition } from '../../shared/llm/types';
import { assertOutputPolicy } from './guards/output-policy';
import { PromptLoader } from './prompt-loader';
import type { LlmProvider } from './providers/provider';
import { OpenRouterProvider } from './providers/openrouter';
import { CredentialStore } from './credential-store';
import { LlmSettingsStore, LlmUsageStore } from './usage-store';

interface LlmDefaults {
  defaultModel: string;
  fallbackModels: string[];
  pingTestModel: string;
  pingTestFallbackModels: string[];
  timeoutMs: number;
  maxRetries: number;
  defaultMonthlyTokenBudget?: number;
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
    pingTestModel: 'google/gemini-2.5-flash',
    pingTestFallbackModels: ['qwen/qwen-plus', 'openai/gpt-4o-mini'],
    timeoutMs: 60_000,
    maxRetries: 2,
    defaultMonthlyTokenBudget: 500_000,
  };
}

export class LlmRunner {
  private provider: LlmProvider;
  private readonly promptLoader: PromptLoader;
  private readonly credentialStore: CredentialStore | null;
  private readonly usageStore: LlmUsageStore | null;
  private readonly settingsStore: LlmSettingsStore | null;
  private readonly defaults: LlmDefaults;
  private readonly enforcePolicy: boolean;
  private readonly streamControllers = new Map<string, AbortController>();

  constructor(options: { dataDir?: string; promptsDir?: string; provider?: LlmProvider; enforcePolicy?: boolean }) {
    this.defaults = loadDefaults();
    this.promptLoader = new PromptLoader(options.promptsDir);
    this.credentialStore = options.dataDir ? new CredentialStore(options.dataDir) : null;
    this.settingsStore = options.dataDir
      ? new LlmSettingsStore(options.dataDir, { defaultMonthlyTokenBudget: this.defaults.defaultMonthlyTokenBudget })
      : null;
    this.usageStore =
      options.dataDir && this.settingsStore ? new LlmUsageStore(options.dataDir, this.settingsStore) : null;
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

  getUsageSummary(): LlmUsageSummary | null {
    return this.usageStore?.getSummary() ?? null;
  }

  getSettings(): LlmUserSettings | null {
    return this.settingsStore?.read() ?? null;
  }

  saveSettings(settings: LlmUserSettings): LlmUserSettings {
    if (!this.settingsStore) throw new Error('设置存储不可用');
    return this.settingsStore.save(settings);
  }

  previewPrompt(promptId: PromptId, variables: Record<string, string>): LlmPromptPreview {
    const { system, user, definition } = this.promptLoader.render(promptId, variables);
    return {
      promptId,
      promptVersion: definition.version,
      system,
      user,
    };
  }

  cancelStream(streamId: string): void {
    this.streamControllers.get(streamId)?.abort();
  }

  private assertConfigured(): void {
    if (this.provider instanceof OpenRouterProvider) {
      const apiKey = this.credentialStore?.getApiKey() ?? process.env.OPENROUTER_API_KEY?.trim() ?? null;
      if (!apiKey) throw new LlmNotConfiguredError();
    }
  }

  private assertBudget(): void {
    this.usageStore?.assertWithinBudget();
  }

  private recordUsage(result: LlmCompletionResult): void {
    if (!this.usageStore) return;
    this.usageStore.record({
      promptId: result.promptId,
      model: result.model,
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
    });

    if (this.settingsStore?.read().debugLogging) {
      console.info(
        `[llm] prompt=${result.promptId} v${result.promptVersion} model=${result.model} in=${result.usage?.inputTokens ?? 0} out=${result.usage?.outputTokens ?? 0} latency=${result.latencyMs}ms`,
      );
    }
  }

  async run(promptId: PromptId, variables: Record<string, string>): Promise<LlmCompletionResult> {
    this.assertConfigured();
    this.assertBudget();

    const { system, user, definition } = this.promptLoader.render(promptId, variables);
    const messages = [
      { role: 'system' as const, content: system },
      { role: 'user' as const, content: user },
    ];

    return this.completeMessages(promptId, definition, messages);
  }

  /** 携带图片调用视觉模型，用于截图识别等场景。 */
  async runVision(
    promptId: PromptId,
    variables: Record<string, string>,
    imagePath: string,
  ): Promise<LlmCompletionResult> {
    this.assertConfigured();
    this.assertBudget();

    const { system, user, definition } = this.promptLoader.render(promptId, variables);
    const imageUrl = loadImageDataUrl(imagePath);
    const userContent: LlmContentPart[] = [
      { type: 'text', text: user },
      { type: 'image_url', image_url: { url: imageUrl } },
    ];
    const messages = [
      { role: 'system' as const, content: system },
      { role: 'user' as const, content: userContent },
    ];

    return this.completeMessages(promptId, definition, messages);
  }

  private async completeMessages(
    promptId: PromptId,
    definition: PromptDefinition,
    messages: Array<{ role: 'system' | 'user'; content: string | LlmContentPart[] }>,
  ): Promise<LlmCompletionResult> {
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

        const normalized = { ...result, promptId, promptVersion: definition.version };
        this.recordUsage(normalized);
        return normalized;
      } catch (error: unknown) {
        lastError = error;
      }
    }

    throw lastError;
  }

  async runStream(
    promptId: PromptId,
    variables: Record<string, string>,
    onChunk: (delta: string) => void,
    streamId?: string,
  ): Promise<LlmCompletionResult> {
    this.assertConfigured();
    this.assertBudget();

    const controller = new AbortController();
    if (streamId) this.streamControllers.set(streamId, controller);

    try {
      const { system, user, definition } = this.promptLoader.render(promptId, variables);
      const messages = [
        { role: 'system' as const, content: system },
        { role: 'user' as const, content: user },
      ];

      const result = await this.provider.completeStream(
        messages,
        {
          promptId,
          promptVersion: definition.version,
          model: definition.model,
          fallbackModels: definition.fallbackModels,
          temperature: definition.temperature,
          maxTokens: definition.maxTokens,
          responseFormat: definition.responseFormat,
          timeoutMs: this.defaults.timeoutMs,
        },
        { onChunk, signal: controller.signal },
      );

      if (this.enforcePolicy && promptId !== 'release.notes' && promptId !== 'release.plan') {
        assertOutputPolicy(result.content);
      }

      const normalized = { ...result, promptId, promptVersion: definition.version };
      this.recordUsage(normalized);
      return normalized;
    } finally {
      if (streamId) this.streamControllers.delete(streamId);
    }
  }

  async testConnection(): Promise<{ ok: boolean; model: string; latencyMs: number }> {
    const apiKey = this.credentialStore?.getApiKey() ?? process.env.OPENROUTER_API_KEY?.trim() ?? null;
    if (!apiKey) throw new LlmNotConfiguredError();

    // 默认模型可能是 reasoning 路由，max_tokens 较小时只返回推理字段而无 content。
    const result = await this.provider.complete(
      [
        { role: 'system', content: '你是连接测试助手，只回复 OK。' },
        { role: 'user', content: 'ping' },
      ],
      {
        model: this.defaults.pingTestModel,
        fallbackModels: this.defaults.pingTestFallbackModels,
        temperature: 0,
        maxTokens: 16,
        timeoutMs: this.defaults.timeoutMs,
      },
    );

    return { ok: true, model: result.model, latencyMs: result.latencyMs };
  }
}

export function createLlmRunner(dataDir?: string, promptsDir?: string): LlmRunner {
  return new LlmRunner({ dataDir, promptsDir });
}

function loadImageDataUrl(imagePath: string): string {
  const resolved = path.resolve(imagePath);
  const extension = path.extname(resolved).toLowerCase();
  const mediaType =
    extension === '.png'
      ? 'image/png'
      : extension === '.webp'
        ? 'image/webp'
        : extension === '.gif'
          ? 'image/gif'
          : 'image/jpeg';
  const base64 = fs.readFileSync(resolved).toString('base64');
  return `data:${mediaType};base64,${base64}`;
}
