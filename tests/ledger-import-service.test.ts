import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LedgerAiExtractedRecord } from '../src/shared/portfolio/ledger-import-types';
import { AppDatabase } from '../src/service/database/database';
import { createLedgerImportService } from '../src/service/portfolio/ledger-import-service';
import { createPortfolioService } from '../src/service/portfolio/portfolio-service';
import { marketService } from '../src/service/market/market-service';

const tempDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function createTestDatabase(): AppDatabase {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trading-diary-ledger-import-'));
  tempDirs.push(dir);
  return new AppDatabase(path.join(dir, 'app.sqlite'));
}

function makeTradeRecord(overrides: Partial<LedgerAiExtractedRecord> = {}): LedgerAiExtractedRecord {
  return {
    rowIndex: 1,
    symbol: '000158',
    instrumentName: '常山北明',
    side: 'buy',
    tradeAt: '2024-03-15',
    price: 8.52,
    quantity: 1000,
    amount: 8520,
    fees: 5,
    note: null,
    rawType: '买入',
    recordKind: 'trade',
    sourceImageIndex: 0,
    sourceFileName: 'test.png',
    ...overrides,
  };
}

describe('ledger import service', () => {
  it('commitTradeRecords imports multiple trades without nested value access errors', async () => {
    const database = createTestDatabase();
    const portfolioService = createPortfolioService(database);
    const importService = createLedgerImportService(database, portfolioService);
    const accountId = database.portfolio.ensureDefaultAccount();

    vi.spyOn(marketService, 'resolve').mockResolvedValue({
      symbol: '000158',
      name: '常山北明',
      kind: 'stock',
      venue: 'SZ',
    } as never);

    const records = [
      makeTradeRecord({ rowIndex: 1, tradeAt: '2024-06-20', side: 'sell', quantity: 500, price: 9.18 }),
      makeTradeRecord({ rowIndex: 2, tradeAt: '2024-03-15', side: 'buy' }),
    ];

    const result = await importService.commitTradeRecords({ accountId, records });

    expect(result.errors, JSON.stringify(result)).toEqual([]);
    expect(result.imported).toBe(2);
    expect(result.failed).toBe(0);
    expect(database.portfolio.listLedger(accountId)).toHaveLength(2);

    database.close();
  });
});
