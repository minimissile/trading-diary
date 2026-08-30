import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppDatabase } from '../src/service/database/database';

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fund-profile-db-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe('FundProfileDatabase', () => {
  it('persists full fund profile json', () => {
    const database = new AppDatabase(path.join(temporaryDirectory(), 'database', 'app.sqlite'));
    expect(database.schemaVersion()).toBeGreaterThanOrEqual(18);

    const profile = {
      FCODE: '017805',
      SHORTNAME: '惠升和润39个月封闭债券',
      FUNDTYPE: '003',
      SGZT: '封闭期',
      SHZT: '封闭期',
      FTYPE: '债券型-长债',
    };

    database.fundProfiles.upsert('017805', 'otc_fund', profile);
    const cached = database.fundProfiles.get('017805');

    expect(cached?.symbol).toBe('017805');
    expect(cached?.kind).toBe('otc_fund');
    expect(cached?.profile.SHORTNAME).toBe('惠升和润39个月封闭债券');
    expect(cached?.profile.SGZT).toBe('封闭期');

    const listed = database.fundProfiles.list(['017805', '021972']);
    expect(listed).toHaveLength(1);

    database.close();
  });
});
