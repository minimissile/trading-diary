import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenRouterProvider } from '../../src/service/llm/providers/openrouter';

describe('OpenRouterProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('404 模型不存在时会继续尝试 fallback', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { model: string; response_format?: unknown };
      if (body.model === 'missing/model') {
        return new Response(
          JSON.stringify({ error: { message: 'No endpoints found for missing/model.', code: 404 } }),
          { status: 404 },
        );
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"ok":true}' } }],
          usage: { prompt_tokens: 1, completion_tokens: 2 },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenRouterProvider({
      getApiKey: () => 'sk-or-test',
      defaultModel: 'missing/model',
      fallbackModels: ['google/gemini-2.5-flash'],
      timeoutMs: 5_000,
    });

    const result = await provider.complete(
      [{ role: 'user', content: 'ping' }],
      { model: 'missing/model', fallbackModels: ['google/gemini-2.5-flash'], responseFormat: 'json' },
    );

    expect(result.model).toBe('google/gemini-2.5-flash');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
