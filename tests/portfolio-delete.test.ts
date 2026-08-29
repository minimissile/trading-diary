import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ALL_ACCOUNTS_ID } from '../src/shared/accounts/constants';
import { AppDatabase } from '../src/service/database/database';

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'trading-diary-portfolio-delete-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe('PortfolioDatabase delete', () => {
  it('deletes a single ledger entry', () => {
    const database = new AppDatabase(path.join(temporaryDirectory(), 'database', 'app.sqlite'));
    const accountId = database.portfolio.ensureDefaultAccount();
    const entry = database.portfolio.addLedgerEntry({
      accountId,
      symbol: '600519',
      kind: 'stock',
      side: 'buy',
      quantity: 100,
      price: 1500,
      fees: 0,
      tradeAt: '2026-01-02T09:30:00.000Z',
      source: 'manual',
    });

    database.portfolio.deleteLedgerEntry(entry.id);

    expect(database.portfolio.listLedger(accountId)).toHaveLength(0);
    database.close();
  });

  it('deletes all ledger entries for a symbol in one account', () => {
    const database = new AppDatabase(path.join(temporaryDirectory(), 'database', 'app.sqlite'));
    const accountId = database.portfolio.ensureDefaultAccount();
    database.portfolio.addLedgerEntry({
      accountId,
      symbol: '510300',
      kind: 'etf',
      side: 'buy',
      quantity: 1000,
      price: 3.5,
      fees: 0,
      tradeAt: '2026-01-02T09:30:00.000Z',
      source: 'manual',
    });
    database.portfolio.addLedgerEntry({
      accountId,
      symbol: '510300',
      kind: 'etf',
      side: 'sell',
      quantity: 200,
      price: 3.6,
      fees: 0,
      tradeAt: '2026-02-02T09:30:00.000Z',
      source: 'manual',
    });

    const removed = database.portfolio.deletePositionLedger(accountId, '510300');

    expect(removed).toBe(2);
    expect(database.portfolio.listLedger(accountId)).toHaveLength(0);
    database.close();
  });

  it('deletes symbol ledger across all active accounts when using ALL_ACCOUNTS_ID', () => {
    const database = new AppDatabase(path.join(temporaryDirectory(), 'database', 'app.sqlite'));
    const defaultId = database.portfolio.ensureDefaultAccount();
    const second = database.accounts.createAccount({
      alias: '二号',
      broker: 'huatai',
      isDefault: false,
    });

    for (const accountId of [defaultId, second.id]) {
      database.portfolio.addLedgerEntry({
        accountId,
        symbol: '530015',
        kind: 'otc_fund',
        side: 'buy',
        quantity: 500,
        price: 1,
        fees: 0,
        tradeAt: '2026-01-02T09:30:00.000Z',
        source: 'manual',
      });
    }

    const removed = database.portfolio.deletePositionLedger(ALL_ACCOUNTS_ID, '530015');

    expect(removed).toBe(2);
    expect(database.portfolio.listAllLedger()).toHaveLength(0);
    database.close();
  });
});
