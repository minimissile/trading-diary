import { describe, expect, it } from 'vitest';
import { PROMPT_IDS } from '../../src/shared/llm/prompt-id';
import { LlmNotConfiguredError } from '../../src/shared/llm/errors';
import { LlmRunner } from '../../src/service/llm/llm-runner';
import { MockProvider } from '../../src/service/llm/providers/mock';

describe('LlmRunner', () => {
  it('注入 MockProvider 时不消耗真实 token', async () => {
    const runner = new LlmRunner({ enforcePolicy: false });
    runner.useProvider(
      new MockProvider({
        [PROMPT_IDS.REVIEW_SUMMARIZE]: JSON.stringify({
          summary: '按计划入场，退出略早。',
          lesson: '下次等待目标价或规则止损再退出。',
        }),
      }),
    );

    const result = await runner.run(PROMPT_IDS.REVIEW_SUMMARIZE, {
      symbol: '600519',
      title: '测试复盘',
      directionLabel: '做多',
      plannedLabel: '是',
      entryPrice: '100',
      exitPrice: '105',
      quantity: '100',
      fees: '5',
      pnl: '495',
      executionScore: '4',
      planContext: '',
      partialAnswers: '',
    });

    expect(result.content).toContain('按计划入场');
    expect(result.model).toBe('mock/model');
  });

  it('testConnection 使用 ping 专用模型而非默认 reasoning 路由', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-test';
    const runner = new LlmRunner({ enforcePolicy: false });
    runner.useProvider(new MockProvider({ [PROMPT_IDS.RELEASE_NOTES]: 'OK' }));

    const result = await runner.testConnection();
    expect(result.ok).toBe(true);
    expect(result.model).toBe('mock/model');
    delete process.env.OPENROUTER_API_KEY;
  });

  it('未配置 API Key 时 testConnection 抛出 LlmNotConfiguredError', async () => {
    const runner = new LlmRunner({ enforcePolicy: false });
    await expect(runner.testConnection()).rejects.toBeInstanceOf(LlmNotConfiguredError);
  });
});
