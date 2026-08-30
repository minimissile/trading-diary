import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppDatabase } from '../src/service/database/database';
import { createSipService } from '../src/service/sip/sip-service';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function createTestDatabase(): AppDatabase {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trading-diary-sip-'));
  tempDirs.push(dir);
  return new AppDatabase(path.join(dir, 'app.sqlite'));
}

describe('sip service integration', () => {
  it('creates plan, scans due, confirms occurrence into ledger', () => {
    const database = createTestDatabase();
    const service = createSipService(database);

    const plan = database.sip.createPlan(
      {
        symbol: '161725',
        amount: 500,
        frequency: 'monthly',
        dayOfMonth: 1,
        startDate: '2026-01-01',
        thesis: '长期配置',
        activateNow: true,
      },
      { name: '招商中证白酒', kind: 'otc_fund', accountId: database.portfolio.ensureDefaultAccount() },
    );

    database.sip.ensureRollingOccurrences(plan, '2026-01-01');
    const scan = service.scanDue();
    expect(scan.newlyDue).toBeGreaterThan(0);

    const due = database.sip.listDueOccurrences()[0];
    expect(due).toBeDefined();

    const result = database.sip.markOccurrenceCompleted(due!.id, {
      amount: 500,
      quantity: 200,
      nav: 2.5,
      fees: 0,
      ledgerEntryId: 'ledger-test',
      confirmedAt: '2026-01-01T08:00:00.000Z',
    });

    expect(result.status).toBe('completed');
    database.close();
  });

  it('exposes position meta and occurrence calendar views', () => {
    const database = createTestDatabase();
    const service = createSipService(database);
    const accountId = database.portfolio.ensureDefaultAccount();

    const plan = database.sip.createPlan(
      {
        symbol: '510300',
        amount: 300,
        frequency: 'monthly',
        dayOfMonth: 15,
        startDate: '2026-03-01',
        thesis: '宽基定投',
        activateNow: true,
      },
      { name: '沪深300ETF', kind: 'etf', accountId },
    );

    database.sip.ensureRollingOccurrences(plan, '2026-03-01');

    const meta = service.getPositionMeta(accountId);
    expect(meta.some((item) => item.symbol === '510300' && item.activePlanNames.includes('沪深300ETF'))).toBe(
      true,
    );

    const calendar = service.getOccurrenceCalendar('2026-03');
    expect(calendar.some((day) => day.date === '2026-03-15')).toBe(true);

    database.close();
  });

  it('creates daily plan with trading-day occurrences only', () => {
    const database = createTestDatabase();
    const plan = database.sip.createPlan(
      {
        symbol: '004598',
        amount: 90,
        frequency: 'daily',
        startDate: '2026-01-02',
        thesis: '每个交易日定投',
        activateNow: true,
      },
      { name: '南方中证银行ETF发起联接C', kind: 'otc_fund', accountId: database.portfolio.ensureDefaultAccount() },
    );

    database.sip.ensureRollingOccurrences(plan, '2026-01-02');
    const occurrences = database.sip.listOccurrences(plan.id);
    expect(occurrences.length).toBeGreaterThan(0);
    expect(occurrences.every((item) => {
      const day = new Date(`${item.scheduledDate}T12:00:00`).getDay();
      return day >= 1 && day <= 5;
    })).toBe(true);

    database.close();
  });
});
