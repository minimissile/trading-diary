import fs from 'node:fs';
import path from 'node:path';

export class CredentialStore {
  private readonly keyFilePath: string;

  constructor(dataDir: string) {
    this.keyFilePath = path.join(dataDir, 'llm', 'openrouter-api-key');
  }

  getApiKey(): string | null {
    const fromEnv = process.env.OPENROUTER_API_KEY?.trim();
    if (fromEnv) return fromEnv;

    try {
      const stored = fs.readFileSync(this.keyFilePath, 'utf8').trim();
      return stored || null;
    } catch {
      return null;
    }
  }

  saveApiKey(apiKey: string): void {
    const trimmed = apiKey.trim();
    if (!trimmed) throw new Error('API Key 不能为空');
    fs.mkdirSync(path.dirname(this.keyFilePath), { recursive: true });
    fs.writeFileSync(this.keyFilePath, `${trimmed}\n`, { encoding: 'utf8', mode: 0o600 });
  }

  clearApiKey(): void {
    try {
      fs.unlinkSync(this.keyFilePath);
    } catch {
      // 文件不存在时忽略
    }
  }

  hasConfiguredKey(): boolean {
    return Boolean(this.getApiKey());
  }
}
