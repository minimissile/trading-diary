import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ALL_ACCOUNTS_ID } from '../src/shared/accounts/constants';
import { AppDatabase } from '../src/service/database/database';
import { createPortfolioService } from '../src/service/portfolio/portfolio-service';
import { computeYtdReceived } from '../src/service/portfolio/dividend-stats';

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'trading-diary-dividend-accounts-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe('portfolio dividend all accounts', () => {
  it('lists and sums dividends across active accounts', async () => {
    const database = new AppDatabase(path.join(temporaryDirectory(), 'database', 'app.sqlite'));
    const service = createPortfolioService(database);
    const defaultId = database.portfolio.ensureDefaultAccount();
    const second = database.accounts.createAccount({
      alias: '二号',
      broker: 'huatai',
      isDefault: false,
    });

    database.portfolio.upsertDividend({
      accountId: defaultId,
      symbol: '600941',
      kind: 'stock',
      exDividendDate: '2026-06-05',
      recordDate: '2026-06-04',
      payDate: null,
      cashPerShare: 1,
      eligibleQuantity: 100,
      cashAmount: 100,
      status: 'confirmed',
      source: 'api',
      externalEventKey: 'a',
    });
    database.portfolio.upsertDividend({
      accountId: second.id,
      symbol: '600941',
      kind: 'stock',
      exDividendDate: '2026-06-05',
      recordDate: '2026-06-04',
      payDate: null,
      cashPerShare: 1,
      eligibleQuantity: 200,
      cashAmount: 200,
      status: 'confirmed',
      source: 'api',
      externalEventKey: 'b',
    });

    const records = await service.listDividends(ALL_ACCOUNTS_ID, 2026);
    const summary = await service.getSummary(ALL_ACCOUNTS_ID, 2026);

    expect(records).toHaveLength(2);
    expect(records.every((record) => record.accountId)).toBe(true);
    expect(computeYtdReceived(records, 2026)).toBe(300);
    expect(summary.ytdReceived).toBe(300);
    database.close();
  });

  it('returns dividends for the selected account after confirm', async () => {
    const database = new AppDatabase(path.join(temporaryDirectory(), 'database', 'app.sqlite'));
    const service = createPortfolioService(database);
    const defaultId = database.portfolio.ensureDefaultAccount();
    const second = database.accounts.createAccount({
      alias: '二号',
      broker: 'huatai',
      isDefault: false,
    });

    const pending = database.portfolio.upsertDividend({
      accountId: defaultId,
      symbol: '600941',
      kind: 'stock',
      exDividendDate: '2026-07-05',
      recordDate: '2026-07-04',
      payDate: null,
      cashPerShare: 1,
      eligibleQuantity: 100,
      cashAmount: 100,
      status: 'estimated',
      source: 'api',
      externalEventKey: 'pending-default',
    });
    database.portfolio.upsertDividend({
      accountId: second.id,
      symbol: '600941',
      kind: 'stock',
      exDividendDate: '2026-07-05',
      recordDate: '2026-07-04',
      payDate: null,
      cashPerShare: 1,
      eligibleQuantity: 200,
      cashAmount: 200,
      status: 'estimated',
      source: 'api',
      externalEventKey: 'pending-second',
    });

    const allRecords = await service.confirmDividend(pending.id, true, undefined, ALL_ACCOUNTS_ID, 2026);
    expect(allRecords).toHaveLength(2);
    expect(allRecords.find((record) => record.id === pending.id)?.status).toBe('confirmed');
    expect(allRecords.find((record) => record.id !== pending.id)?.status).toBe('estimated');

    const defaultRecords = await service.listDividends(defaultId, 2026);
    expect(defaultRecords).toHaveLength(1);
    expect(defaultRecords[0]?.accountId).toBe(defaultId);
    database.close();
  });
});
