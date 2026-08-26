import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import {
  computeLicenseExpiry,
  generateLicenseId,
  signLicensePayload,
  verifyLicenseCode,
} from '../src/service/license/codec';
import { LicenseError } from '../src/shared/license/errors';
import { FREE_MAX_ALERTS, FREE_MAX_PLANS, resolveLicenseEntitlements, TRIAL_DAYS } from '../src/shared/license/features';
import { LicenseService } from '../src/service/license/license-service';

describe('license codec', () => {
  it('signs and verifies a pro license code', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const payload = {
      v: 1 as const,
      tier: 'pro' as const,
      exp: computeLicenseExpiry(30),
      lid: generateLicenseId(),
    };
    const code = signLicensePayload(payload, privatePem);
    const verified = verifyLicenseCode(code, publicPem);
    expect(verified).toEqual(payload);
  });

  it('rejects tampered license codes', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const code = signLicensePayload(
      { v: 1, tier: 'pro', exp: computeLicenseExpiry(30), lid: generateLicenseId() },
      privatePem,
    );
    expect(() => verifyLicenseCode(`${code}x`, publicPem)).toThrow(LicenseError);
  });
});

describe('license entitlements', () => {
  it('limits free tier plans and alerts', () => {
    const free = resolveLicenseEntitlements('free');
    expect(free.limits.maxPlans).toBe(FREE_MAX_PLANS);
    expect(free.limits.maxAlerts).toBe(FREE_MAX_ALERTS);
    expect(free.features).toEqual([]);
  });

  it('grants pro features during trial tier', () => {
    const trial = resolveLicenseEntitlements('trial');
    expect(trial.limits.maxPlans).toBeNull();
    expect(trial.features).toContain('ai_review');
  });
});

describe('LicenseService', () => {
  let dataDir = '';

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  it('starts a trial on first status read', () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'td-license-'));
    const service = new LicenseService(dataDir);
    const status = service.getStatus();
    expect(status.tier).toBe('trial');
    expect(status.trialDaysRemaining).toBeGreaterThan(0);
    expect(status.trialDaysRemaining).toBeLessThanOrEqual(TRIAL_DAYS);
  });

  it('activates a signed license code', () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'td-license-'));
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const code = signLicensePayload(
      { v: 1, tier: 'lifetime', exp: '2099-12-31', lid: generateLicenseId() },
      privatePem,
    );

    const service = new LicenseService(dataDir, { publicKeyPem: publicPem });
    const result = service.activate(code);
    expect(result.status.tier).toBe('lifetime');
    expect(result.status.licenseId).toBeTruthy();

    const reloaded = new LicenseService(dataDir, { publicKeyPem: publicPem });
    expect(reloaded.getStatus().tier).toBe('lifetime');
    expect(verifyLicenseCode(code, publicPem).tier).toBe('lifetime');
  });

  it('blocks ai feature on free tier after trial expires', () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'td-license-'));
    const startedAt = new Date(Date.now() - (TRIAL_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString();
    writeFileSync(path.join(dataDir, 'trial.json'), `${JSON.stringify({ startedAt })}\n`, 'utf8');
    const service = new LicenseService(dataDir);
    expect(service.getStatus().tier).toBe('free');
    expect(() => service.assertFeature('ai_review')).toThrow(LicenseError);
  });
});
