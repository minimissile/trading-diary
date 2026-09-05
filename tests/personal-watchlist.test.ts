import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppDatabase } from '../src/service/database/database';
import { migrations } from '../src/service/database/migrations';
import type { InstrumentInfo, MarketQuote } from '../src/shared/market/types';
import { serviceRequestSchema } from '../src/shared/schemas/service-request';

const instrument: InstrumentInfo = {
  symbol: '600519',
  name: '贵州茅台',
  kind: 'stock',
  venue: 'SH',
  market: 'SH',
  quoteCurrency: 'CNY',
  secid: '1.600519',
  f10Code: 'SH600519',
  securityTypeName: 'A股',
  source: 'eastmoney',
};
function quote(price = 100): MarketQuote {
  return {
    ...instrument,
    price,
    open: null,
    high: null,
    low: null,
    prevClose: null,
    change: null,
    changePercent: null,
    volume: null,
    amount: null,
    peTtm: null,
    pb: null,
    dividendYieldTtm: null,
    nav: null,
    navDate: null,
    estimatedNav: null,
    estimatedNavChangePercent: null,
    fetchedAt: new Date().toISOString(),
  };
}

describe('personal watchlist persistence and reminders', () => {
  let directory: string;
  let database: AppDatabase;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'personal-watchlist-'));
    database = new AppDatabase(path.join(directory, 'app.sqlite'));
  });
  afterEach(() => {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('persists groups, tags, reference price and duplicate identity without overwriting observations', () => {
    const group = database.watchlist.saveGroup({ name: '长期关注' });
    const another = database.watchlist.saveGroup({ name: '重点行业' });
    const result = database.watchlist.add(instrument, quote(123.4567), {
      groupIds: [group.id, another.id],
      tags: ['龙头'],
      starred: true,
    });
    const duplicate = database.watchlist.add(instrument, quote(150), { tags: ['不应覆盖'] });
    expect(duplicate.alreadyExists).toBe(true);
    expect(duplicate.item.id).toBe(result.item.id);
    expect(duplicate.item.addedPrice).toBe(123.4567);
    expect(duplicate.item.tags).toEqual(['龙头']);
    database.close();
    database = new AppDatabase(path.join(directory, 'app.sqlite'));
    expect(database.watchlist.get(result.item.id).starred).toBe(true);
    expect(database.watchlist.get(result.item.id).groupIds).toEqual(expect.arrayContaining([group.id, another.id]));
    database.watchlist.saveGroup({ id: group.id, name: '长线' });
    database.watchlist.removeGroup(group.id);
    expect(database.watchlist.get(result.item.id).groupIds).toEqual([another.id]);
    expect(database.watchlist.list()).toHaveLength(1);
  });

  it('does not invent or later backfill a missing or stale reference price', () => {
    const stale = { ...quote(), fetchedAt: '2020-01-01T00:00:00Z' };
    const item = database.watchlist.add(instrument, stale, {}).item;
    expect(item.addedPrice).toBeNull();
    expect(item.addedPriceAt).toBeNull();
    expect(database.watchlist.add(instrument, quote(), {}).item.addedPrice).toBeNull();
  });

  it('rejects invalid membership changes atomically', () => {
    const item = database.watchlist.add(instrument, null, { tags: ['原标签'] }).item;
    expect(() => database.watchlist.update(item.id, { starred: true, tags: ['新标签'], groupIds: [randomUUID()] })).toThrow();
    expect(database.watchlist.get(item.id)).toMatchObject({ starred: false, tags: ['原标签'], groupIds: [] });
  });

  it('keeps dated review and feeling records, orders by recording date, and isolates stocks', () => {
    const item = database.watchlist.add(instrument, null, {}).item;
    const other = database.watchlist.add({ ...instrument, symbol: '600036' }, null, {}).item;
    const first = database.watchlist.saveLog({
      itemId: item.id,
      date: '2026-09-05',
      review: '承接有力\n成交量放大',
      feeling: '先观察',
    });
    database.watchlist.saveLog({ itemId: item.id, date: '2026-09-04', review: '补记昨天', feeling: '' });
    database.watchlist.saveLog({ itemId: item.id, date: '2026-09-05', review: '', feeling: '收盘后仍然谨慎' });
    expect(database.watchlist.listLogs(item.id).map((log) => log.date)).toEqual(['2026-09-05', '2026-09-05', '2026-09-04']);
    expect(database.watchlist.get(item.id)).toMatchObject({
      logCount: 3,
      latestLogDate: '2026-09-05',
      latestLog: '收盘后仍然谨慎',
    });
    expect(() => database.watchlist.saveLog({ ...first, itemId: other.id, review: '不能改另一只股票' })).toThrow();
    database.watchlist.saveLog({ ...first, review: '更新复盘', feeling: '更新盘感' });
    expect(database.watchlist.listLogs(item.id).find((log) => log.id === first.id)).toMatchObject({
      review: '更新复盘',
      feeling: '更新盘感',
      createdAt: first.createdAt,
    });
    expect(database.watchlist.listLogs(other.id)).toEqual([]);
    database.watchlist.removeLog(first.id, item.id);
    expect(database.watchlist.get(item.id).logCount).toBe(2);
    expect(() => database.watchlist.saveLog({ itemId: item.id, date: '2026-02-30', review: 'invalid', feeling: '' })).toThrow(
      '日期无效',
    );
    expect(() => database.watchlist.saveLog({ itemId: item.id, date: '2026-09-05', review: '  ', feeling: '' })).toThrow(
      '请填写',
    );
  });

  it('uses the existing reminder engine, rearms without creating duplicate rules, and retains trigger history', () => {
    const item = database.watchlist.add(instrument, quote(), {}).item;
    const first = database.watchlist.setReminder({ id: item.id, reminder: { condition: 'at_or_below', targetPrice: 90.1234 } });
    expect(database.evaluatePrice(item.symbol, 95).newlyTriggered).toEqual([]);
    expect(database.evaluatePrice(item.symbol, 90.1234).newlyTriggered).toHaveLength(1);
    expect(database.evaluatePrice(item.symbol, 85).newlyTriggered).toHaveLength(0);
    expect(database.watchlist.get(item.id).reminder?.status).toBe('triggered');
    const rearmed = database.watchlist.setReminder({ id: item.id, reminder: { condition: 'at_or_above', targetPrice: 110 } });
    expect(rearmed.reminder?.id).toBe(first.reminder?.id);
    expect(database.countTradeAlerts()).toBe(1);
    expect(database.evaluatePrice(item.symbol, 110).newlyTriggered).toHaveLength(1);
    expect(database.alertEvents.listEvents()).toHaveLength(2);
    database.watchlist.setReminder({ id: item.id, reminder: null });
    expect(database.watchlist.get(item.id).reminder).toBeNull();
  });

  it('preserves plans, ledger and logs on removal, restores logs on re-add and disables only its own monitor', () => {
    const item = database.watchlist.add(instrument, quote(), {}).item;
    database.watchlist.saveLog({ itemId: item.id, date: '2026-09-05', review: '保留判断', feeling: '' });
    const plan = database.createTradingPlan({
      symbol: item.symbol,
      name: '计划',
      direction: 'long',
      thesis: '独立交易计划',
      entryPrice: 100,
      stopPrice: 90,
      targetPrice: 120,
      riskAmount: 1000,
      activateNow: false,
    });
    database.portfolio.addLedgerEntry({
      accountId: database.portfolio.ensureDefaultAccount(),
      symbol: item.symbol,
      venue: item.venue,
      kind: 'stock',
      side: 'buy',
      quantity: 100,
      price: 100,
      fees: 0,
      tradeAt: new Date().toISOString(),
      source: 'manual',
    });
    const unrelated = database.createTradeAlert({
      symbol: item.symbol,
      title: '独立提醒',
      condition: 'at_or_above',
      targetPrice: 200,
    });
    const reminder = database.watchlist.setReminder({
      id: item.id,
      reminder: { condition: 'at_or_below', targetPrice: 90 },
    }).reminder!;
    expect(database.watchlist.get(item.id).holding).toBe(true);
    database.watchlist.remove(item.id);
    expect(database.watchlist.list()).toEqual([]);
    expect(database.listTradingPlans().some((row) => row.id === plan.id)).toBe(true);
    expect(database.listTradeAlerts().find((row) => row.id === unrelated.id)?.status).toBe('active');
    expect(database.listTradeAlerts().find((row) => row.id === reminder.id)?.status).toBe('disabled');
    const restored = database.watchlist.add(instrument, quote(120), {}).item;
    expect(restored).toMatchObject({ id: item.id, logCount: 1, holding: true, addedPrice: 120 });
    expect(database.watchlist.listLogs(restored.id)[0]?.review).toBe('保留判断');
  });

  it('keeps stable manual ordering within each star priority', () => {
    const a = database.watchlist.add(instrument, null, {}).item;
    const b = database.watchlist.add({ ...instrument, symbol: '600036' }, null, {}).item;
    const c = database.watchlist.add({ ...instrument, symbol: '600000' }, null, { starred: true }).item;
    database.watchlist.move(b.id, 'up');
    expect(database.watchlist.list().map((row) => row.id)).toEqual([c.id, b.id, a.id]);
    database.watchlist.move(c.id, 'down');
    expect(database.watchlist.list().map((row) => row.id)).toEqual([c.id, b.id, a.id]);
  });

  it('separates market identities and uses the Hong Kong lookup key in alerts', () => {
    const hk = database.watchlist.add(
      { ...instrument, symbol: '00700', venue: 'HK', market: null, quoteCurrency: 'HKD' },
      null,
      {},
    ).item;
    database.watchlist.setReminder({ id: hk.id, reminder: { condition: 'at_or_above', targetPrice: 500 } });
    expect(database.listActiveAlertSymbols()).toContain('00700.HK');
  });

  it('migrates an existing version 25 database without losing its records', () => {
    const migrationFile = path.join(directory, 'old.sqlite');
    const old = new DatabaseSync(migrationFile);
    old.exec(
      'CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT;',
    );
    for (const migration of migrations.filter((entry) => entry.version <= 25)) {
      old.exec(migration.sql);
      old
        .prepare('INSERT INTO schema_migrations VALUES (?, ?, ?)')
        .run(migration.version, migration.name, new Date().toISOString());
    }
    old.close();
    const migrated = new AppDatabase(migrationFile);
    try {
      expect(migrated.schemaVersion()).toBe(migrations.at(-1)!.version);
      expect(migrated.watchlist.list()).toEqual([]);
    } finally {
      migrated.close();
    }
  });

  it('validates IPC request dates, ownership fields and positive reminder prices', () => {
    const itemId = randomUUID();
    expect(
      serviceRequestSchema.safeParse({
        id: randomUUID(),
        method: 'watchlist.saveLog',
        params: { itemId, date: '2026-02-30', review: 'test', feeling: '' },
      }).success,
    ).toBe(false);
    expect(
      serviceRequestSchema.safeParse({
        id: randomUUID(),
        method: 'watchlist.setReminder',
        params: { id: itemId, reminder: { condition: 'at_or_below', targetPrice: 0 } },
      }).success,
    ).toBe(false);
    expect(
      serviceRequestSchema.safeParse({
        id: randomUUID(),
        method: 'watchlist.update',
        params: { id: itemId, changes: { symbol: '600000' } },
      }).success,
    ).toBe(false);
  });
});
