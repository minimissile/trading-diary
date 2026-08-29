import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { AccessLockSettingsView } from '../../shared/security/access-lock.types';

const MIN_PASSWORD_LENGTH = 4;
const MAX_PASSWORD_LENGTH = 64;
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

interface AccessLockFile {
  enabled: boolean;
  salt?: string;
  hash?: string;
}

function assertPasswordLength(password: string): void {
  const length = password.length;
  if (length < MIN_PASSWORD_LENGTH || length > MAX_PASSWORD_LENGTH) {
    throw new Error(`访问密码长度需在 ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} 位之间`);
  }
}

function hashPassword(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
}

function verifyPassword(password: string, saltHex: string, hashHex: string): boolean {
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = hashPassword(password, salt);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export class AccessLockStore {
  private readonly filePath: string;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, 'security', 'access-lock.json');
  }

  getSettings(): AccessLockSettingsView {
    const stored = this.read();
    return {
      enabled: stored.enabled,
      hasPassword: Boolean(stored.hash && stored.salt),
    };
  }

  verifyPassword(password: string): boolean {
    const stored = this.read();
    if (!stored.hash || !stored.salt) return false;
    return verifyPassword(password, stored.salt, stored.hash);
  }

  enable(newPassword: string): AccessLockSettingsView {
    assertPasswordLength(newPassword);
    const salt = randomBytes(16);
    const hash = hashPassword(newPassword, salt);
    this.write({
      enabled: true,
      salt: salt.toString('hex'),
      hash: hash.toString('hex'),
    });
    return this.getSettings();
  }

  enableExisting(): AccessLockSettingsView {
    const stored = this.read();
    if (!stored.hash || !stored.salt) {
      throw new Error('请先设置访问密码');
    }
    this.write({ ...stored, enabled: true });
    return this.getSettings();
  }

  disable(password: string): AccessLockSettingsView {
    const stored = this.read();
    if (!stored.hash || !stored.salt) {
      this.write({ enabled: false });
      return this.getSettings();
    }
    if (!verifyPassword(password, stored.salt, stored.hash)) {
      throw new Error('当前密码不正确');
    }
    this.write({ enabled: false, salt: stored.salt, hash: stored.hash });
    return this.getSettings();
  }

  changePassword(currentPassword: string, newPassword: string): AccessLockSettingsView {
    assertPasswordLength(newPassword);
    const stored = this.read();
    if (!stored.hash || !stored.salt) {
      throw new Error('尚未设置访问密码');
    }
    if (!verifyPassword(currentPassword, stored.salt, stored.hash)) {
      throw new Error('当前密码不正确');
    }
    const salt = randomBytes(16);
    const hash = hashPassword(newPassword, salt);
    this.write({
      enabled: stored.enabled,
      salt: salt.toString('hex'),
      hash: hash.toString('hex'),
    });
    return this.getSettings();
  }

  private read(): AccessLockFile {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<AccessLockFile>;
      return {
        enabled: parsed.enabled === true,
        salt: typeof parsed.salt === 'string' ? parsed.salt : undefined,
        hash: typeof parsed.hash === 'string' ? parsed.hash : undefined,
      };
    } catch {
      return { enabled: false };
    }
  }

  private write(data: AccessLockFile): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  }
}
