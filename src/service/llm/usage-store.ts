import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { PromptId } from '../../shared/llm/prompt-id';
import type { LlmUsageRecord, LlmUsageSummary, LlmUserSettings } from '../../shared/llm/types';
import { LlmBudgetExceededError } from '../../shared/llm/errors';

interface UsageFile {
  records: LlmUsageRecord[];
}

interface LlmDefaults {
  defaultMonthlyTokenBudget?: number;
}

function currentMonthKey(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

export class LlmSettingsStore {
  private readonly settingsPath: string;
  private readonly defaults: LlmDefaults;

  constructor(dataDir: string, defaults: LlmDefaults = {}) {
    this.settingsPath = path.join(dataDir, 'llm', 'settings.json');
    this.defaults = defaults;
  }

  read(): LlmUserSettings {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.settingsPath, 'utf8')) as Partial<LlmUserSettings>;
      return {
        monthlyTokenBudget:
          parsed.monthlyTokenBudget === null
            ? null
            : typeof parsed.monthlyTokenBudget === 'number'
              ? parsed.monthlyTokenBudget
              : (this.defaults.defaultMonthlyTokenBudget ?? null),
        debugLogging: Boolean(parsed.debugLogging),
      };
    } catch {
      return {
        monthlyTokenBudget: this.defaults.defaultMonthlyTokenBudget ?? null,
        debugLogging: false,
      };
    }
  }

  save(settings: LlmUserSettings): LlmUserSettings {
    fs.mkdirSync(path.dirname(this.settingsPath), { recursive: true });
    fs.writeFileSync(this.settingsPath, `${JSON.stringify(settings, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    return settings;
  }
}

export class LlmUsageStore {
  private readonly usagePath: string;
  private readonly settingsStore: LlmSettingsStore;

  constructor(dataDir: string, settingsStore: LlmSettingsStore) {
    this.usagePath = path.join(dataDir, 'llm', 'usage.json');
    this.settingsStore = settingsStore;
  }

  private readFile(): UsageFile {
    try {
      return JSON.parse(fs.readFileSync(this.usagePath, 'utf8')) as UsageFile;
    } catch {
      return { records: [] };
    }
  }

  private writeFile(data: UsageFile): void {
    fs.mkdirSync(path.dirname(this.usagePath), { recursive: true });
    fs.writeFileSync(this.usagePath, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  }

  record(entry: {
    promptId: PromptId;
    model: string;
    inputTokens: number;
    outputTokens: number;
  }): LlmUsageRecord {
    const record: LlmUsageRecord = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      promptId: entry.promptId,
      model: entry.model,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
    };

    const data = this.readFile();
    data.records.unshift(record);
    data.records = data.records.slice(0, 500);
    this.writeFile(data);
    return record;
  }

  getSummary(month = currentMonthKey()): LlmUsageSummary {
    const settings = this.settingsStore.read();
    const records = this.readFile().records.filter((record) => record.timestamp.startsWith(month));
    const totalInputTokens = records.reduce((sum, record) => sum + record.inputTokens, 0);
    const totalOutputTokens = records.reduce((sum, record) => sum + record.outputTokens, 0);
    const totalTokens = totalInputTokens + totalOutputTokens;
    const budget = settings.monthlyTokenBudget;

    return {
      month,
      totalInputTokens,
      totalOutputTokens,
      totalTokens,
      requestCount: records.length,
      monthlyTokenBudget: budget,
      budgetRemaining: budget === null ? null : Math.max(0, budget - totalTokens),
      budgetExceeded: budget !== null && totalTokens >= budget,
      recentRecords: records.slice(0, 20),
    };
  }

  assertWithinBudget(): void {
    const summary = this.getSummary();
    if (summary.budgetExceeded) {
      throw new LlmBudgetExceededError('本月 token 预算已用尽，可在设置中调整预算或下月再试');
    }
  }
}
