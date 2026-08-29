import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppDatabase } from '../src/service/database/database';
import { createSipImportService } from '../src/service/sip/sip-import-service';
import { createSipService } from '../src/service/sip/sip-service';
import { buildSipReviewTemplate, summarizePlanOccurrences } from '../src/service/sip/sip-stats';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function createTestDatabase(): AppDatabase {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trading-diary-sip-import-'));
  tempDirs.push(dir);
  return new AppDatabase(path.join(dir, 'app.sqlite'));
}

describe('sip import', () => {
  it('imports historical rows into ledger and links plan occurrences', async () => {
    const database = createTestDatabase();
    const sipService = createSipService(database);
    const importService = createSipImportService(database);
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

    const csvPath = path.join(os.tmpdir(), `sip-import-${Date.now()}.csv`);
    fs.writeFileSync(
      csvPath,
      '代码,扣款日期,净值,金额\n161725,2026-01-01,2.5,500\n',
      'utf8',
    );

    const mapping = {
      symbol: 0,
      tradeAt: 1,
      nav: 2,
      amount: 3,
      quantity: -1,
      fees: -1,
    };

    const preview = importService.preview({ sourcePath: csvPath, accountId, mapping });
    expect(preview.readyCount).toBe(1);

    const result = await importService.commit({ sourcePath: csvPath, accountId, mapping });
    expect(result.errors, JSON.stringify(result)).toEqual([]);
    expect(result.imported).toBe(1);
    expect(result.linkedToPlan).toBe(1);

    const meta = sipService.getPositionMeta(accountId);
    expect(meta.some((item) => item.symbol === '161725' && item.confirmedBuyCount >= 1)).toBe(true);

    fs.unlinkSync(csvPath);
    database.close();
  });

  it('auto-creates a sip plan when importing without an existing plan', async () => {
    const database = createTestDatabase();
    const importService = createSipImportService(database);
    const sipService = createSipService(database);
    const accountId = database.portfolio.ensureDefaultAccount();

    const csvPath = path.join(os.tmpdir(), `sip-import-auto-plan-${Date.now()}.csv`);
    fs.writeFileSync(
      csvPath,
      '代码,扣款日期,净值,金额\n110022,2026-01-05,1.8,300\n110022,2026-02-05,1.82,300\n',
      'utf8',
    );

    const mapping = {
      symbol: 0,
      tradeAt: 1,
      nav: 2,
      amount: 3,
      quantity: -1,
      fees: -1,
    };

    const preview = importService.preview({ sourcePath: csvPath, accountId, mapping });
    expect(preview.readyCount).toBe(2);
    expect(preview.rows.every((item) => item.matchedPlanName === '导入时自动创建')).toBe(true);

    const result = await importService.commit({ sourcePath: csvPath, accountId, mapping });
    expect(result.plansCreated).toBe(1);
    expect(result.linkedToPlan).toBe(2);
    expect(result.ledgerOnly).toBe(0);

    const plans = sipService.listPlans();
    expect(plans.some((plan) => plan.symbol === '110022')).toBe(true);
    expect(sipService.listOccurrenceViews().filter((item) => item.symbol === '110022' && item.status === 'completed').length).toBe(2);

    fs.unlinkSync(csvPath);
    database.close();
  });
});

describe('sip review template', () => {
  it('builds periodic review draft from plan stats', () => {
    const template = buildSipReviewTemplate(
      {
        name: '沪深300',
        symbol: '510300',
        thesis: '宽基长期配置',
        amount: 300,
        frequency: 'monthly',
      },
      summarizePlanOccurrences([
        { status: 'completed', scheduledDate: '2026-01-01' },
        { status: 'completed', scheduledDate: '2026-02-01' },
        { status: 'skipped', scheduledDate: '2026-03-01' },
      ]),
      { quantity: 200, avgCost: 3.2, unrealizedPnl: 120 },
    );

    expect(template.title).toContain('沪深300');
    expect(template.summary).toContain('宽基长期配置');
    expect(template.summary).toContain('纪律率');
    expect(template.lesson).toContain('经验沉淀');
  });
});
