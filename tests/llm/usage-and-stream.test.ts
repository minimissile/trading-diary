import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PROMPT_IDS } from '../../src/shared/llm/prompt-id';
import { LlmBudgetExceededError } from '../../src/shared/llm/errors';
import { LlmRunner } from '../../src/service/llm/llm-runner';
import { MockProvider } from '../../src/service/llm/providers/mock';
import { LlmSettingsStore, LlmUsageStore } from '../../src/service/llm/usage-store';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe('LlmUsageStore', () => {
  it('累计本月 token 并在超预算时拒绝', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-usage-'));
    temporaryDirectories.push(directory);
    const settingsStore = new LlmSettingsStore(directory, { defaultMonthlyTokenBudget: 100 });
    settingsStore.save({ monthlyTokenBudget: 100, debugLogging: false });
    const usageStore = new LlmUsageStore(directory, settingsStore);

    usageStore.record({
      promptId: PROMPT_IDS.REVIEW_SUMMARIZE,
      model: 'mock/model',
      inputTokens: 40,
      outputTokens: 50,
    });

    const summary = usageStore.getSummary();
    expect(summary.totalTokens).toBe(90);
    expect(summary.budgetRemaining).toBe(10);

    usageStore.record({
      promptId: PROMPT_IDS.REVIEW_SUMMARIZE,
      model: 'mock/model',
      inputTokens: 5,
      outputTokens: 6,
    });

    expect(() => usageStore.assertWithinBudget()).toThrow(LlmBudgetExceededError);
  });
});

describe('LlmRunner stream', () => {
  it('runStream 会逐块输出并记录用量', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-stream-'));
    temporaryDirectories.push(directory);
    const runner = new LlmRunner({ dataDir: directory, enforcePolicy: false });
    runner.useProvider(
      new MockProvider({
        [PROMPT_IDS.REVIEW_SUMMARIZE]: JSON.stringify({ summary: '好', lesson: '规则' }),
      }),
    );

    const chunks: string[] = [];
    const result = await runner.runStream(
      PROMPT_IDS.REVIEW_SUMMARIZE,
      {
        symbol: '600519',
        title: '测试',
        directionLabel: '做多',
        plannedLabel: '是',
        entryPrice: '1',
        exitPrice: '2',
        quantity: '1',
        fees: '0',
        pnl: '1',
        executionScore: '4',
        planContext: '',
        partialAnswers: '',
      },
      (delta) => chunks.push(delta),
    );

    expect(chunks.join('')).toContain('"summary"');
    expect(result.content).toContain('"summary"');
    expect(runner.getUsageSummary()?.requestCount).toBe(1);
  });
});
