import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { afterEach } from 'vitest';

const snapshots: string[] = [];
afterEach(() => {
  for (const dir of snapshots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Integration tests run migrations only on an atomic copy, never on a user's original database. */
export async function snapshotTestDatabase(path: string): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'trading-diary-db-test-'));
  snapshots.push(dir);
  const destination = join(dir, 'app.sqlite');
  const source = new DatabaseSync(path, { readOnly: true });
  try {
    await backup(source, destination);
  } finally {
    source.close();
  }
  return destination;
}
