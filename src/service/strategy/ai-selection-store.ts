import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  aiSelectionKeySchema,
  aiSelectionQuerySchema,
  aiSelectionSettingsSchema,
  DEFAULT_SELECTION_QUERY,
  selectionPlatformSchema,
  type AiSelectionQuery,
  type AiSelectionResult,
  type AiSelectionSettings,
  type AiSelectionState,
  type SelectionPlatform,
} from '../../shared/strategy/ai-selection';
import { AiSelectionProvider } from './ai-selection-provider';

export interface SelectionCipher {
  available: () => boolean;
  encrypt: (value: string) => Buffer;
  decrypt: (value: Buffer) => string;
}

export class AiSelectionStore {
  private readonly directory: string;
  private state: { settings: AiSelectionSettings; history: AiSelectionResult[] };
  private keys: Partial<Record<SelectionPlatform, string>>;
  private readonly pending = new Map<string, Promise<AiSelectionResult>>();

  constructor(
    dataDir: string,
    private readonly cipher: SelectionCipher,
    private readonly provider = new AiSelectionProvider(),
  ) {
    this.directory = path.join(dataDir, 'stock-selection');
    mkdirSync(this.directory, { recursive: true });
    const saved = this.read('state-v1.json') as { settings: unknown; history: AiSelectionResult[] } | null;
    this.state = {
      settings: saved
        ? aiSelectionSettingsSchema.parse(saved.settings)
        : { platform: 'wencai', queries: { wencai: DEFAULT_SELECTION_QUERY, eastmoney: DEFAULT_SELECTION_QUERY }, limit: 30 },
      history: saved && Array.isArray(saved.history) ? saved.history.slice(0, 30) : [],
    };
    this.keys = this.read('keys-v1.json') ?? {};
    if (
      Object.entries(this.keys).some(
        ([key, value]) => !selectionPlatformSchema.safeParse(key).success || typeof value !== 'string',
      )
    )
      throw new Error('选股密钥文件损坏，未覆盖原文件');
  }

  private read(name: string): unknown {
    try {
      return JSON.parse(readFileSync(path.join(this.directory, name), 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new Error(`选股配置 ${name} 无法读取，未覆盖原文件`, { cause: error });
    }
  }

  private write(name: string, value: unknown): void {
    const target = path.join(this.directory, name);
    const temporary = `${target}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
    renameSync(temporary, target);
  }

  getState(): AiSelectionState {
    return structuredClone({
      ...this.state,
      configured: { wencai: Boolean(this.keys.wencai), eastmoney: Boolean(this.keys.eastmoney) },
    });
  }

  saveSettings(value: AiSelectionSettings): AiSelectionState {
    const next = { ...this.state, settings: aiSelectionSettingsSchema.parse(value) };
    this.write('state-v1.json', next);
    this.state = next;
    return this.getState();
  }

  saveKey(value: { platform: SelectionPlatform; apiKey: string }): AiSelectionState {
    const parsed = aiSelectionKeySchema.safeParse(value);
    if (!parsed.success) throw new Error('请选择平台并填写有效的 API Key（不能含空白或中文）');
    if (!this.cipher.available()) throw new Error('系统安全存储不可用，暂时无法保存密钥');
    const next = { ...this.keys, [parsed.data.platform]: this.cipher.encrypt(parsed.data.apiKey).toString('base64') };
    this.write('keys-v1.json', next);
    this.keys = next;
    return this.getState();
  }

  clearKey(value: SelectionPlatform): AiSelectionState {
    const platform = selectionPlatformSchema.parse(value);
    const next = { ...this.keys };
    delete next[platform];
    this.write('keys-v1.json', next);
    this.keys = next;
    return this.getState();
  }

  query(value: AiSelectionQuery): Promise<AiSelectionResult> {
    const input = aiSelectionQuerySchema.parse(value);
    const key = JSON.stringify(input);
    const pending = this.pending.get(key);
    if (pending) return pending;
    const run = this.run(input).finally(() => this.pending.delete(key));
    this.pending.set(key, run);
    return run;
  }

  private async run(input: AiSelectionQuery): Promise<AiSelectionResult> {
    const encrypted = this.keys[input.platform];
    if (!encrypted) throw new Error('请先配置当前平台的 API Key');
    if (!this.cipher.available()) throw new Error('系统安全存储不可用，请解锁系统密钥链后重试');
    let apiKey: string;
    try {
      apiKey = this.cipher.decrypt(Buffer.from(encrypted, 'base64'));
    } catch {
      throw new Error('密钥无法解密，请在本机重新保存当前平台的 API Key');
    }
    const payload = await this.provider.query(input, apiKey);
    const result: AiSelectionResult = {
      ...payload,
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      warnings: [
        ...payload.warnings,
        '查询时间不是行情日期；数据日期以返回指标标注为准。自然语言条件由平台解析，请核对指标。',
        '这是一份查询时点的候选名单，导入后回测仅检验固定股票池，不能代表该自然语言条件的历史选股收益。',
      ],
    };
    const next = { ...this.state, history: [result, ...this.state.history].slice(0, 30) };
    this.write('state-v1.json', next);
    this.state = next;
    return structuredClone(result);
  }
}
