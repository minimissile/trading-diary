import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PROMPT_IDS } from '../src/shared/llm/prompt-id';
import { AppDatabase } from '../src/service/database/database';
import { createLlmRunner } from '../src/service/llm/llm-runner';
import { MockProvider } from '../src/service/llm/providers/mock';
import { createSipAiImportService } from '../src/service/sip/sip-ai-import-service';
import { createSipImportService } from '../src/service/sip/sip-import-service';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function createTestDatabase(): AppDatabase {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trading-diary-sip-ai-import-'));
  tempDirs.push(dir);
  return new AppDatabase(path.join(dir, 'app.sqlite'));
}

describe('sip ai import', () => {
  it('parses screenshot recognition payload and previews import rows', async () => {
    const database = createTestDatabase();
    const importService = createSipImportService(database);
    const runner = createLlmRunner(undefined, path.join(process.cwd(), 'src/prompts'));
    runner.useProvider(
      new MockProvider({
        [PROMPT_IDS.SIP_IMPORT_SCREENSHOT]: JSON.stringify({
          records: [
            {
              symbol: '161725',
              fundName: '招商中证白酒',
              tradeDate: '2026-01-01',
              nav: 2.5,
              amount: 500,
              quantity: 200,
              fees: 0,
            },
          ],
          warnings: ['截图底部略有遮挡'],
        }),
      }),
    );
    const aiImportService = createSipAiImportService(importService, runner);
    const accountId = database.portfolio.ensureDefaultAccount();

    database.sip.createPlan(
      {
        symbol: '161725',
        amount: 500,
        frequency: 'monthly',
        dayOfMonth: 1,
        startDate: '2026-01-01',
        thesis: '长期配置',
        activateNow: true,
      },
      { name: '招商中证白酒', kind: 'otc_fund', accountId },
    );

    const screenshotPath = path.join(os.tmpdir(), `sip-ai-${Date.now()}.png`);
    fs.writeFileSync(screenshotPath, Buffer.from([137, 80, 78, 71]));

    const recognized = await aiImportService.recognizeScreenshot(screenshotPath);
    expect(recognized.records).toHaveLength(1);
    expect(recognized.records[0]?.symbol).toBe('161725');
    expect(recognized.warnings).toContain('截图底部略有遮挡');

    const preview = aiImportService.preview({ accountId, records: recognized.records });
    expect(preview.readyCount).toBe(1);

    const result = await aiImportService.commit({ accountId, records: recognized.records });
    expect(result.errors, JSON.stringify(result)).toEqual([]);
    expect(result.imported).toBe(1);
    expect(result.linkedToPlan).toBe(1);

    fs.unlinkSync(screenshotPath);
    database.close();
  });
});
