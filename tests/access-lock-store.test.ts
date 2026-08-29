import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AccessLockStore } from '../src/service/security/access-lock-store';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function createStore(): AccessLockStore {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trading-diary-access-lock-'));
  tempDirs.push(dir);
  return new AccessLockStore(dir);
}

describe('access lock store', () => {
  it('defaults to disabled without password', () => {
    const store = createStore();
    expect(store.getSettings()).toEqual({ enabled: false, hasPassword: false });
  });

  it('enables with password and verifies correctly', () => {
    const store = createStore();
    store.enable('1234');
    expect(store.getSettings()).toEqual({ enabled: true, hasPassword: true });
    expect(store.verifyPassword('1234')).toBe(true);
    expect(store.verifyPassword('0000')).toBe(false);
  });

  it('disables with password but keeps hash for re-enable', () => {
    const store = createStore();
    store.enable('abcd');
    store.disable('abcd');
    expect(store.getSettings()).toEqual({ enabled: false, hasPassword: true });
    store.enableExisting();
    expect(store.getSettings()).toEqual({ enabled: true, hasPassword: true });
  });

  it('changes password', () => {
    const store = createStore();
    store.enable('old-pass');
    store.changePassword('old-pass', 'new-pass');
    expect(store.verifyPassword('new-pass')).toBe(true);
    expect(store.verifyPassword('old-pass')).toBe(false);
  });
});
