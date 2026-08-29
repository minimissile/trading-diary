import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppDatabase } from '../src/service/database/database';

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'trading-diary-accounts-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe('AccountDatabase.deleteAccount', () => {
  it('仅允许删除已归档账户并级联清理关联数据', () => {
    const database = new AppDatabase(path.join(temporaryDirectory(), 'database', 'app.sqlite'));
    const created = database.accounts.createAccount({
      alias: '测试',
      broker: 'huatai',
      isDefault: false,
    });

    database.portfolio.addLedgerEntry({
      accountId: created.id,
      symbol: '600519',
      kind: 'stock',
      side: 'buy',
      quantity: 100,
      price: 1500,
      fees: 5,
      tradeAt: '2026-01-02T09:30:00.000Z',
      note: '',
      source: 'manual',
    });

    expect(() => database.accounts.deleteAccount(created.id)).toThrow('仅已归档账户可删除');

    database.accounts.archiveAccount(created.id);
    database.accounts.deleteAccount(created.id);

    expect(database.accounts.listAccounts(true)).toHaveLength(1);
    expect(database.portfolio.listLedger(created.id)).toHaveLength(0);
    database.close();
  });

  it('删除后清理仅该账户使用的自定义费率模板', () => {
    const database = new AppDatabase(path.join(temporaryDirectory(), 'database', 'app.sqlite'));
    const created = database.accounts.createAccount({
      alias: '自定义费率',
      broker: 'custom',
      customFee: {
        commissionWan: 1.5,
      },
    });
    const feeProfileId = created.feeProfileId;
    expect(feeProfileId).toBeTruthy();

    database.accounts.archiveAccount(created.id);
    database.accounts.deleteAccount(created.id);

    expect(() => database.accounts.getFeeProfile(feeProfileId!)).toThrow('费率模板不存在');
    database.close();
  });
});

describe('AccountDatabase ETF market fees', () => {
  it('保存上证与深证独立的 ETF 佣金', () => {
    const database = new AppDatabase(path.join(temporaryDirectory(), 'database', 'app.sqlite'));
    const created = database.accounts.createAccount({
      alias: 'ETF分市场',
      broker: 'huatai',
      customFee: {
        commissionWan: 2.5,
        commissionMinYuan: 5,
        etfShCommissionWan: 0.5,
        etfShNoCommissionMin: true,
        etfSzCommissionWan: 0.8,
        etfSzCommissionMinYuan: 5,
      },
    });

    const profile = database.accounts.getFeeProfile(created.feeProfileId!);
    expect(profile.etfShCommissionWan).toBe(0.5);
    expect(profile.etfShCommissionMinCents).toBe(0);
    expect(profile.etfSzCommissionWan).toBe(0.8);
    expect(profile.etfSzCommissionMinCents).toBe(500);
    database.close();
  });
});
