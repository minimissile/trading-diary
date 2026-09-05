import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_QUANT_SETTINGS, quantCompletedDate } from '../src/shared/quant-research/catalog';
import type { QuantRun, QuantSeries, QuantSettings } from '../src/shared/quant-research/types';
import { serviceRequestSchema } from '../src/shared/service.schemas';
import { scanQuantSeries } from '../src/service/quant-research/quant-engine';
import { parseQuantBucket, TencentQuantDataProvider, type QuantDataProvider } from '../src/service/quant-research/quant-data';
import { QuantResearchService } from '../src/service/quant-research/quant-service';
import { AppDatabase } from '../src/service/database/database';
import { migrations } from '../src/service/database/migrations';
import { BackupService } from '../src/service/backup/backup-service';
import { defaultResearchRequest } from '../src/shared/quant-research/workbench';

const directories: string[] = [];
const databases: AppDatabase[] = [];
const settings: QuantSettings = { ...DEFAULT_QUANT_SETTINGS, poolId: 'custom', symbols: ['600036'], lookback: 20, recentDays: 1 };
const now = () => new Date('2026-09-06T03:00:00Z');
const temporary = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quant-research-test-'));
  directories.push(dir);
  return dir;
};
const database = (directory = temporary()) => {
  const db = new AppDatabase(path.join(directory, 'database', 'app.sqlite'));
  databases.push(db);
  return db;
};
afterEach(() => {
  for (const db of databases.splice(0)) {
    try {
      db.close();
    } catch {
      /* Backup restore has already closed its source handle. */
    }
  }
  for (const dir of directories.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function fixture(symbol = '600036'): QuantSeries {
  const bars: QuantSeries['bars'] = [];
  for (
    let date = new Date('2026-04-01T00:00:00Z');
    date <= new Date('2026-09-04T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    if ([0, 6].includes(date.getUTCDay())) continue;
    bars.push({ date: date.toISOString().slice(0, 10), open: 10, high: 11, low: 9, close: 10, volume: 100 });
  }
  return { symbol, name: '测试证券', bars };
}

function provider(change?: (series: QuantSeries) => void): QuantDataProvider {
  return {
    load: vi.fn((symbol: string, _date: string, benchmark?: boolean) => {
      const stock = fixture(symbol);
      if (!benchmark) change?.(stock);
      return Promise.resolve(stock);
    }),
  };
}

function runFixture(overrides: Partial<QuantRun> = {}): QuantRun {
  return {
    id: randomUUID(),
    createdAt: now().toISOString(),
    startDate: '2026-09-04',
    endDate: '2026-09-04',
    scannedCount: 1,
    matchedCount: 0,
    signalCount: 0,
    excludedCount: 0,
    settings,
    universe: [{ symbol: '600036', name: '测试证券' }],
    signals: [],
    exclusions: [],
    source: 'tencent',
    engineVersion: 1,
    ...overrides,
  };
}

describe('quant research signal definitions', () => {
  it('uses prior highs instead of prior closes and never includes the signal day in the high window', () => {
    const stock = fixture();
    const bar = stock.bars.at(-1)!;
    Object.assign(bar, { open: 10, close: 10.8, high: 12 });
    expect(scanQuantSeries(stock, [bar.date], { ...settings, rules: ['new_high'] })).toEqual([]);
    bar.close = 11.1;
    expect(scanQuantSeries(stock, [bar.date], { ...settings, rules: ['new_high'] })[0]?.ruleId).toBe('new_high');
  });

  it('finds a strict closing low, not an intraday touch', () => {
    const stock = fixture();
    const bar = stock.bars.at(-1)!;
    Object.assign(bar, { low: 8, close: 9 });
    expect(scanQuantSeries(stock, [bar.date], { ...settings, rules: ['new_low'] })).toEqual([]);
    bar.close = 8.9;
    expect(scanQuantSeries(stock, [bar.date], { ...settings, rules: ['new_low'] })).toHaveLength(1);
  });

  it('triggers only on the crossing day and is invariant to future prices', () => {
    const stock = fixture();
    const signalDate = stock.bars.at(-2)!.date;
    Object.assign(stock.bars.at(-2)!, { close: 12, high: 12 });
    Object.assign(stock.bars.at(-1)!, { close: 13, high: 13 });
    const config = { ...settings, rules: ['ma_cross_up'] as const };
    const first = scanQuantSeries(stock, [signalDate, stock.bars.at(-1)!.date], { ...config, rules: [...config.rules] });
    expect(first.map((signal) => signal.date)).toEqual([signalDate]);
    stock.bars.at(-1)!.close = 0.1;
    expect(scanQuantSeries(stock, [signalDate], { ...config, rules: [...config.rules] })).toEqual(first);
  });

  it('detects downward crosses and computes volume against the preceding 20 days', () => {
    const stock = fixture();
    const bar = stock.bars.at(-1)!;
    Object.assign(bar, { close: 8, low: 8, volume: 200 });
    const signals = scanQuantSeries(stock, [bar.date], {
      ...settings,
      rules: ['ma_cross_down', 'volume_surge'],
      volumeMultiple: 2,
    });
    expect(signals.map((signal) => signal.ruleId)).toEqual(['ma_cross_down', 'volume_surge']);
    expect(signals[1]?.volumeRatio).toBe(2);
  });

  it('requires directional engulfing and excludes identical bodies and doji from the upper-shadow rule', () => {
    const stock = fixture();
    const before = stock.bars.at(-2)!;
    const bar = stock.bars.at(-1)!;
    Object.assign(before, { open: 11, close: 10 });
    Object.assign(bar, { open: 9.5, close: 11, high: 11.2 });
    expect(scanQuantSeries(stock, [bar.date], { ...settings, rules: ['bullish_engulfing'] })).toHaveLength(1);
    bar.open = 10;
    expect(scanQuantSeries(stock, [bar.date], { ...settings, rules: ['bullish_engulfing'] })).toHaveLength(0);
    Object.assign(before, { open: 10, close: 11 });
    Object.assign(bar, { open: 11.2, close: 9.5, high: 12 });
    expect(scanQuantSeries(stock, [bar.date], { ...settings, rules: ['bearish_engulfing'] })).toHaveLength(1);
    Object.assign(bar, { open: 10, close: 10.5, high: 13, low: 9.9 });
    expect(scanQuantSeries(stock, [bar.date], { ...settings, rules: ['upper_shadow'] })).toHaveLength(1);
    bar.close = bar.open;
    expect(scanQuantSeries(stock, [bar.date], { ...settings, rules: ['upper_shadow'] })).toHaveLength(0);
  });

  it('does not infer a signal from zero volume', () => {
    const stock = fixture();
    Object.assign(stock.bars.at(-1)!, { close: 12, high: 12, volume: 0 });
    expect(scanQuantSeries(stock, [stock.bars.at(-1)!.date], settings)).toEqual([]);
  });
});

describe('quant research provider and request validation', () => {
  const row = ['2026-09-04', '10', '10.5', '11', '9', '100'];
  const bucket = { qfqday: [row], qt: { sh600036: ['x', '招商银行'] } };
  it('fails closed for missing adjusted data, corrupt bars and duplicate dates', () => {
    expect(parseQuantBucket('600036', 'sh600036', bucket).bars[0]?.close).toBe(10.5);
    expect(() => parseQuantBucket('600036', 'sh600036', { ...bucket, qfqday: undefined, day: [row] })).toThrow('前复权');
    expect(() => parseQuantBucket('600036', 'sh600036', { ...bucket, qfqday: [row, row] })).toThrow('重复');
    expect(() => parseQuantBucket('600036', 'sh600036', { ...bucket, qfqday: [['2026-09-04', 10, 12, 11, 9, 100]] })).toThrow(
      '无效',
    );
    expect(() => parseQuantBucket('600036', 'sh600036', { ...bucket, qfqday: [['2026-02-30', 10, 10, 11, 9, 100]] })).toThrow(
      '无效',
    );
  });

  it('removes unfinished/future dates returned by the provider', async () => {
    const request = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ code: 0, data: { sh600036: { ...bucket, qfqday: [row, ['2026-09-07', 10, 10, 11, 9, 100]] } } }),
        ),
      ),
    );
    const stock = await new TencentQuantDataProvider(request).load('600036', '2026-09-04');
    expect(stock.bars.map((bar) => bar.date)).toEqual(['2026-09-04']);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('uses China time and rejects unknown rules, invalid symbols and excessive requests', () => {
    expect(quantCompletedDate(new Date('2026-09-04T07:29:59Z'))).toBe('2026-09-03');
    expect(quantCompletedDate(new Date('2026-09-04T07:30:00Z'))).toBe('2026-09-04');
    const request = { id: randomUUID(), method: 'quantResearch.scan', params: settings };
    expect(serviceRequestSchema.safeParse(request).success).toBe(true);
    for (const change of [
      { rules: [] },
      { rules: ['unknown'] },
      { symbols: ['../../file'] },
      { recentDays: 21 },
      { maPeriod: 0 },
      { rules: ['new_high', 'new_high'] },
    ]) {
      expect(serviceRequestSchema.safeParse({ ...request, params: { ...settings, ...change } }).success).toBe(false);
    }
  });
});

describe('quant research service and storage', () => {
  it('uses actual index sessions, preserves zero-signal results, and keeps trade records untouched', async () => {
    const db = database();
    const service = new QuantResearchService(db.quantResearch, () => [], provider(), now);
    const result = await service.scan({ ...settings, rules: ['new_high'], recentDays: 2 });
    expect(result.endDate).toBe('2026-09-04');
    expect(result.startDate).toBe('2026-09-03');
    expect(result.scannedCount).toBe(1);
    expect(result.signalCount).toBe(0);
    expect(service.getState().latest).toEqual(result);
    expect(db.countTradingPlans()).toBe(0);
    expect(db.portfolio.countLedgerEntries()).toBe(0);
  });

  it('records partial data failures and does not mislabel them as no signals', async () => {
    const db = database();
    const data: QuantDataProvider = {
      load: (symbol, _cutoff, benchmark) => {
        if (symbol === '000333') return Promise.reject(new Error('HTTP 503'));
        const stock = fixture(symbol);
        if (!benchmark) Object.assign(stock.bars.at(-1)!, { high: 12, close: 12 });
        return Promise.resolve(stock);
      },
    };
    const service = new QuantResearchService(db.quantResearch, () => [], data, now);
    const result = await service.scan({ ...settings, symbols: ['600036', '000333'], rules: ['new_high'] });
    expect(result.scannedCount).toBe(1);
    expect(result.signalCount).toBe(1);
    expect(result.exclusions).toEqual([{ symbol: '000333', name: '000333', reason: 'HTTP 503' }]);
  });

  it.each(['missing', 'short', 'st'])('does not save a false successful run when all stocks are excluded: %s', async (mode) => {
    const db = database();
    const data = provider((stock) => {
      if (mode === 'missing') stock.bars.pop();
      if (mode === 'short') stock.bars = stock.bars.slice(-2);
      if (mode === 'st') stock.name = '*ST测试';
    });
    const service = new QuantResearchService(db.quantResearch, () => [], data, now);
    await expect(service.scan(settings)).rejects.toThrow('没有可完成扫描');
    expect(service.getState().history).toHaveLength(0);
  });

  it('deduplicates concurrent scans, rejects configuration changes during a scan, then allows retries', async () => {
    const db = database();
    let unblock!: () => void;
    const gate = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const data: QuantDataProvider = {
      load: async (symbol) => {
        await gate;
        return fixture(symbol);
      },
    };
    const service = new QuantResearchService(db.quantResearch, () => [], data, now);
    const one = service.scan(settings);
    expect(service.scan(settings)).toBe(one);
    expect(() => service.scan({ ...settings, lookback: 60 })).toThrow('扫描');
    expect(() => service.saveSettings(settings)).toThrow('扫描');
    unblock();
    await one;
    expect(service.getState().history).toHaveLength(1);
    await service.scan(settings);
    expect(service.getState().history).toHaveLength(2);
  });

  it('bounds a personal universe without silently truncating it', () => {
    const db = database();
    const data = provider();
    const service = new QuantResearchService(
      db.quantResearch,
      () => Array.from({ length: 61 }, (_, index) => ({ symbol: `600${String(index).padStart(3, '0')}`, name: '测试' })),
      data,
      now,
    );
    expect(() => service.scan({ ...settings, poolId: 'personal' })).toThrow('60');
    expect(data.load).not.toHaveBeenCalled();
  });

  it('keeps 20 immutable snapshots and persists settings across reopening', () => {
    const dir = temporary();
    const db = database(dir);
    const first = runFixture();
    db.quantResearch.saveRun(first);
    for (let index = 1; index <= 20; index++)
      db.quantResearch.saveRun(runFixture({ createdAt: new Date(now().getTime() + index).toISOString() }));
    expect(db.quantResearch.getState().history).toHaveLength(20);
    expect(() => db.quantResearch.getRun(first.id)).toThrow('不存在');
    db.close();
    databases.pop();
    const reopened = database(dir);
    expect(reopened.quantResearch.getState().settings).toEqual(settings);
    expect(reopened.quantResearch.getState().history).toHaveLength(20);
  });

  it.each([27, 28])('migrates version %i without losing research-independent data', (previousVersion) => {
    const dir = temporary();
    const dbPath = path.join(dir, 'database', 'app.sqlite');
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const raw = new DatabaseSync(dbPath);
    raw.exec(
      'CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT;',
    );
    for (const migration of migrations.filter((item) => item.version <= previousVersion)) {
      raw.exec(migration.sql);
      raw.prepare('INSERT INTO schema_migrations VALUES (?, ?, ?)').run(migration.version, migration.name, now().toISOString());
    }
    raw.exec("CREATE TABLE migration_sentinel (value TEXT); INSERT INTO migration_sentinel VALUES ('keep')");
    raw.close();
    const upgraded = database(dir);
    expect(upgraded.schemaVersion()).toBe(migrations.at(-1)!.version);
    expect(upgraded.quantResearch.getState().history).toEqual([]);
    expect(upgraded.quantWorkbench.state('backtest').history).toEqual([]);
    const inspect = new DatabaseSync(dbPath, { readOnly: true });
    expect(inspect.prepare('SELECT value FROM migration_sentinel').get()).toMatchObject({ value: 'keep' });
    inspect.close();
  });

  it('includes module settings and snapshots in the existing backup/restore flow', () => {
    const sourceDir = temporary();
    const targetDir = temporary();
    const source = database(sourceDir);
    const run = runFixture();
    source.quantResearch.saveRun(run);
    const toolRequest = defaultResearchRequest('lof', now());
    const toolReport = source.quantWorkbench.save(
      {
        id: randomUUID(),
        kind: 'lof',
        request: toolRequest,
        title: 'LOF 快照',
        asOf: '2026-09-04',
        createdAt: now().toISOString(),
        source: 'fixture',
        metrics: [],
        rows: [],
        columns: [],
        notes: [],
        warnings: [],
      },
      [{ symbol: '161725', date: '2026-09-04', shares: 1200 }],
    );
    const zipPath = path.join(sourceDir, 'research.zip');
    new BackupService(sourceDir, source, '0.0.1').exportBackup({ targetPath: zipPath, includeLicense: false });
    const target = database(targetDir);
    new BackupService(targetDir, target, '0.0.1').importBackup({ sourcePath: zipPath }, () => target.close());
    databases.pop();
    const restored = database(targetDir);
    expect(restored.quantResearch.getRun(run.id)).toEqual(run);
    expect(restored.quantResearch.getState().settings).toEqual(settings);
    expect(restored.quantWorkbench.get(toolReport.id)).toEqual(toolReport);
    expect(restored.quantWorkbench.previous('161725', '2026-09-05')).toMatchObject({ shares: 1200 });
  });
});
