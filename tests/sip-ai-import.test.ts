import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROMPT_IDS } from '../src/shared/llm/prompt-id';
import { AppDatabase } from '../src/service/database/database';
import { createLlmRunner } from '../src/service/llm/llm-runner';
import { MockProvider } from '../src/service/llm/providers/mock';
import { marketService } from '../src/service/market/market-service';
import { createSipAiImportService } from '../src/service/sip/sip-ai-import-service';
import { createSipImportService } from '../src/service/sip/sip-import-service';

beforeEach(() => {
  vi.spyOn(marketService, 'resolve').mockImplementation((symbol) =>
    Promise.resolve({
      symbol,
      name: '测试基金',
      kind: 'otc_fund',
      market: null,
      venue: 'OTC',
      quoteCurrency: 'CNY',
      secid: null,
      f10Code: symbol,
      securityTypeName: '基金',
      source: 'eastmoney',
    }),
  );
  vi.spyOn(marketService, 'lookupHistoricalPriceOnDate').mockResolvedValue(null);
});

const tempDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
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
    expect(recognized.planMode).toBe('unknown');
    expect(recognized.hints.some((hint) => hint.includes('不会丢失'))).toBe(true);

    const preview = await aiImportService.preview({ accountId, records: recognized.records });
    expect(preview.preview.readyCount).toBe(1);

    const result = await aiImportService.commit({ accountId, records: recognized.records });
    expect(result.errors, JSON.stringify(result)).toEqual([]);
    expect(result.imported).toBe(1);
    expect(result.linkedToPlan).toBe(1);

    fs.unlinkSync(screenshotPath);
    database.close();
  });

  it('surfaces smart plan hints without blocking import', async () => {
    const database = createTestDatabase();
    const importService = createSipImportService(database);
    const runner = createLlmRunner(undefined, path.join(process.cwd(), 'src/prompts'));
    runner.useProvider(
      new MockProvider({
        [PROMPT_IDS.SIP_IMPORT_SCREENSHOT]: JSON.stringify({
          planMode: 'smart',
          planModeLabel: '智能定投',
          records: [
            {
              symbol: '110011',
              fundName: '易方达优质精选',
              tradeDate: '2026-01-02',
              nav: 5.2,
              amount: 480,
              quantity: 92.3,
              fees: 0,
            },
            {
              symbol: '110011',
              fundName: '易方达优质精选',
              tradeDate: '2026-02-02',
              nav: 5.1,
              amount: 620,
              quantity: 121.5,
              fees: 0,
            },
          ],
          warnings: ['截图仅包含扣款明细'],
        }),
      }),
    );
    const aiImportService = createSipAiImportService(importService, runner);
    const accountId = database.portfolio.ensureDefaultAccount();
    const screenshotPath = path.join(os.tmpdir(), `sip-ai-smart-${Date.now()}.png`);
    fs.writeFileSync(screenshotPath, Buffer.from([137, 80, 78, 71]));

    const recognized = await aiImportService.recognizeScreenshot(screenshotPath);
    expect(recognized.planMode).toBe('smart');
    expect(recognized.planModeLabel).toBe('智能定投');
    expect(recognized.hints.some((hint) => hint.includes('普通定投'))).toBe(true);

    const preview = await aiImportService.preview({ accountId, records: recognized.records });
    expect(preview.preview.readyCount).toBe(2);

    const result = await aiImportService.commit({ accountId, records: recognized.records });
    expect(result.imported).toBe(2);
    expect(result.plansCreated).toBe(1);
    expect(result.linkedToPlan).toBe(2);
    expect(result.ledgerOnly).toBe(0);

    fs.unlinkSync(screenshotPath);
    database.close();
  });

  it('returns incomplete preview rows for partial recognition and imports after manual completion', async () => {
    vi.spyOn(marketService, 'lookupHistoricalPriceOnDate').mockResolvedValue(null);

    const database = createTestDatabase();
    const importService = createSipImportService(database);
    const runner = createLlmRunner(undefined, path.join(process.cwd(), 'src/prompts'));
    runner.useProvider(
      new MockProvider({
        [PROMPT_IDS.SIP_IMPORT_SCREENSHOT]: JSON.stringify({
          screenshotType: 'plan_settings',
          planMode: 'smart',
          planModeLabel: '智能定投',
          planHints: {
            symbol: '110011',
            fundName: '易方达优质精选',
            amount: 500,
            startDate: '2026-01-02',
          },
          records: [],
        }),
      }),
    );
    const aiImportService = createSipAiImportService(importService, runner);
    const accountId = database.portfolio.ensureDefaultAccount();
    const screenshotPath = path.join(os.tmpdir(), `sip-ai-incomplete-${Date.now()}.png`);
    fs.writeFileSync(screenshotPath, Buffer.from([137, 80, 78, 71]));

    const recognized = await aiImportService.recognizeScreenshot(screenshotPath);
    expect(recognized.records).toHaveLength(1);
    expect(recognized.planHints?.symbol).toBe('110011');

    const incompletePreview = await aiImportService.preview({ accountId, records: recognized.records });
    expect(incompletePreview.preview.incompleteCount).toBe(1);
    expect(incompletePreview.preview.readyCount).toBe(0);

    const completedRecords = incompletePreview.records.map((record) => ({
      ...record,
      nav: record.nav ?? 5.2,
    }));
    const readyPreview = await aiImportService.preview({ accountId, records: completedRecords });
    expect(readyPreview.preview.readyCount).toBe(1);

    const result = await aiImportService.commit({ accountId, records: completedRecords });
    expect(result.imported).toBe(1);
    expect(result.plansCreated).toBe(1);
    expect(result.linkedToPlan).toBe(1);
    expect(result.ledgerOnly).toBe(0);

    fs.unlinkSync(screenshotPath);
    database.close();
  });

  it('marks enriched 004598 rows as ready instead of unsupported stock', async () => {
    const database = createTestDatabase();
    const importService = createSipImportService(database);
    const runner = createLlmRunner(undefined, path.join(process.cwd(), 'src/prompts'));
    runner.useProvider(
      new MockProvider({
        [PROMPT_IDS.SIP_IMPORT_SCREENSHOT]: JSON.stringify({
          planMode: 'smart',
          records: [
            {
              symbol: '004598',
              fundName: '南方中证银行ETF发起联接C',
              tradeDate: '2026-08-28',
              amount: 90,
            },
          ],
        }),
      }),
    );
    const aiImportService = createSipAiImportService(importService, runner);
    const accountId = database.portfolio.ensureDefaultAccount();
    const screenshotPath = path.join(os.tmpdir(), `sip-ai-004598-${Date.now()}.png`);
    fs.writeFileSync(screenshotPath, Buffer.from([137, 80, 78, 71]));

    const preview = await aiImportService.preview({
      accountId,
      records: [
        {
          rowIndex: 1,
          symbol: '004598',
          fundName: '南方中证银行ETF发起联接C',
          tradeAt: '2026-08-28',
          nav: 1.3513,
          amount: 90,
          quantity: null,
          fees: null,
        },
      ],
    });

    expect(preview.preview.errorCount).toBe(0);
    expect(preview.preview.readyCount).toBe(1);
    expect(preview.preview.rows[0]?.message).not.toContain('仅支持场外基金');

    fs.unlinkSync(screenshotPath);
    database.close();
  }, 30_000);
});
