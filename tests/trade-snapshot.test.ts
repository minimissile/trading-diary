import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppDatabase } from '../src/service/database/database';
import { chartSnapshotSchema, tradeSnapshotInputSchema, tradeSnapshotKey } from '../src/shared/chart/trade-snapshot';

const image =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const trade = {
  accountId: 'default',
  symbol: '600941',
  name: '中国移动',
  venue: 'SH' as const,
  kind: 'stock' as const,
  side: 'buy' as const,
  price: 100,
  quantity: 100,
  fees: 5,
  tradeAt: '2026-09-04T02:00:00.000Z',
};

describe('trade chart snapshots', () => {
  it('rejects incomplete trades and unsupported image payloads', () => {
    expect(tradeSnapshotInputSchema.safeParse({ ...trade, quantity: 0 }).success).toBe(false);
    expect(tradeSnapshotInputSchema.safeParse({ ...trade, price: NaN }).success).toBe(false);
    expect(chartSnapshotSchema.safeParse('https://example.com/a.png').success).toBe(false);
    expect(chartSnapshotSchema.safeParse(image).success).toBe(true);
  });

  it('invalidates a snapshot when trade identity or values change, but not date formatting', () => {
    const original = tradeSnapshotKey(trade);
    for (const change of [
      { accountId: 'other' },
      { symbol: '000001' },
      { venue: 'OTC' as const },
      { side: 'sell' as const },
      { price: 101 },
      { quantity: 200 },
      { fees: 6 },
      { tradeAt: '2026-09-03T02:00:00Z' },
    ]) {
      expect(tradeSnapshotKey({ ...trade, ...change })).not.toBe(original);
    }
    expect(tradeSnapshotKey({ ...trade, tradeAt: '2026-09-04T10:00:00+08:00' })).toBe(original);
  });

  it('migrates and persists a screenshot, preserves it during note edits, and allows removal', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ledger-snapshot-'));
    let db: AppDatabase | undefined;
    try {
      const file = path.join(dir, 'app.sqlite');
      db = new AppDatabase(file);
      const entry = db.portfolio.addLedgerEntry({ ...trade, chartSnapshot: image });
      expect(entry.chartSnapshot).toBe(image);
      db.portfolio.updateLedgerEntry(entry.id, { note: '复查' });
      db.close();
      db = new AppDatabase(file);
      expect(db.portfolio.listLedgerEntries('default', trade.symbol)[0]?.chartSnapshot).toBe(image);
      expect(db.portfolio.updateLedgerEntry(entry.id, { price: 101 }).chartSnapshot).toBeNull();
      expect(db.portfolio.updateLedgerEntry(entry.id, { chartSnapshot: image }).chartSnapshot).toBe(image);
      expect(db.portfolio.updateLedgerEntry(entry.id, { chartSnapshot: null }).chartSnapshot).toBeNull();
    } finally {
      db?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
