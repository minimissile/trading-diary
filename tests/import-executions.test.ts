import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppDatabase } from '../src/service/database/database';
import { guessExecutionColumnMapping } from '../src/service/import/column-guess';
import { parseCsvFile } from '../src/service/import/csv-parser';
import { ExecutionImportService } from '../src/service/import/execution-import-service';
import { normalizeExecutionRow } from '../src/service/import/row-normalizer';

const temporaryDirectories: string[] = [];

function createDatabase(): AppDatabase {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'trading-import-'));
  temporaryDirectories.push(directory);
  return new AppDatabase(path.join(directory, 'database', 'app.sqlite'));
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe('CSV 导入', () => {
  it('可猜测中文券商表头', () => {
    const mapping = guessExecutionColumnMapping(['成交日期', '证券代码', '买卖方向', '成交价格', '成交数量', '手续费']);
    expect(mapping.symbol).toBe(1);
    expect(mapping.side).toBe(2);
    expect(mapping.tradeAt).toBe(0);
    expect(mapping.price).toBe(3);
    expect(mapping.quantity).toBe(4);
    expect(mapping.fees).toBe(5);
  });

  it('可解析并导入成交 CSV', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'trading-import-csv-'));
    temporaryDirectories.push(directory);
    const csvPath = path.join(directory, 'trades.csv');
    fs.writeFileSync(
      csvPath,
      '成交日期,证券代码,买卖方向,成交价格,成交数量,手续费\n2026-03-10 09:31:00,600519,买入,1500,100,5\n2026-03-15 14:55:00,600519,卖出,1580,100,8\n',
      'utf8',
    );

    const parsed = parseCsvFile(csvPath);
    expect(parsed.headers).toHaveLength(6);
    expect(parsed.rows).toHaveLength(2);

    const mapping = guessExecutionColumnMapping(parsed.headers);
    const normalized = normalizeExecutionRow(parsed.rows[0] ?? [], mapping);
    expect(normalized.ok).toBe(true);
    if (normalized.ok) {
      expect(normalized.value.symbol).toBe('600519');
      expect(normalized.value.side).toBe('buy');
    }

    const database = createDatabase();
    const service = new ExecutionImportService(database.episodes);
    const preview = service.preview({ sourcePath: csvPath, mapping });
    expect(preview.readyCount).toBe(2);
    expect(preview.errorCount).toBe(0);

    const result = service.commit({ sourcePath: csvPath, mapping });
    expect(result.imported).toBe(2);
    expect(result.closedEpisodes).toBe(1);
    expect(database.episodes.listPendingReview()).toHaveLength(1);
    database.close();
  });

  it('重复导入同一 CSV 会跳过重复成交', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'trading-import-dup-'));
    temporaryDirectories.push(directory);
    const csvPath = path.join(directory, 'dup.csv');
    fs.writeFileSync(csvPath, '日期,代码,方向,价格,数量\n2026-04-01,510300,买入,3.8,1000\n', 'utf8');

    const database = createDatabase();
    const service = new ExecutionImportService(database.episodes);
    const mapping = guessExecutionColumnMapping(parseCsvFile(csvPath).headers);

    expect(service.commit({ sourcePath: csvPath, mapping }).imported).toBe(1);
    const second = service.commit({ sourcePath: csvPath, mapping });
    expect(second.imported).toBe(0);
    expect(second.skippedDuplicate).toBe(1);
    database.close();
  });
});
