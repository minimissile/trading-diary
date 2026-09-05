import fs from 'node:fs';
import path from 'node:path';
import { verifyLicenseCode } from './codec';
import { LicenseError } from '../../shared/license/errors';
import { FREE_WATCHLIST_POOLS, resolveLicenseEntitlements, TRIAL_DAYS } from '../../shared/license/features';
import { LICENSE_PUBLIC_KEY_PEM } from '../../shared/license/public-key';
import type { WatchlistPoolId } from '../../shared/watchlist/types';
import type { LicenseActivateResult, LicenseFeature, LicensePayload, LicenseSource, LicenseStatus, LicenseTier } from '../../shared/license/types';

interface StoredLicenseRecord {
  code: string;
  payload: LicensePayload;
  activatedAt: string;
}

interface TrialRecord {
  startedAt: string;
}

/**
 * 管理本机 License 存储、试用与权限解析。
 */
export class LicenseService {
  private readonly licenseFilePath: string;
  private readonly trialFilePath: string;
  private readonly publicKeyPem: string;

  constructor(dataDir: string, options?: { publicKeyPem?: string }) {
    this.licenseFilePath = path.join(dataDir, 'license.json');
    this.trialFilePath = path.join(dataDir, 'trial.json');
    this.publicKeyPem = options?.publicKeyPem ?? LICENSE_PUBLIC_KEY_PEM;
  }

  /**
   * 返回当前 License 状态快照。
   */
  getStatus(): LicenseStatus {
    const stored = this.readStoredLicense();
    if (stored) {
      try {
        const payload = verifyLicenseCode(stored.code, this.publicKeyPem);
        const tier: LicenseTier = payload.tier === 'lifetime' ? 'lifetime' : 'pro';
        const entitlements = resolveLicenseEntitlements(tier);
        return {
          tier,
          source: 'license',
          exp: payload.tier === 'lifetime' ? null : payload.exp,
          trialDaysRemaining: null,
          features: entitlements.features,
          limits: entitlements.limits,
          licenseId: payload.lid,
          activatedAt: stored.activatedAt,
        };
      } catch (error) {
        if (error instanceof LicenseError && error.code === 'LICENSE_EXPIRED') {
          return this.buildFreeStatus('license');
        }
      }
    }

    const trial = this.ensureTrialRecord();
    const trialDaysRemaining = this.getTrialDaysRemaining(trial.startedAt);
    if (trialDaysRemaining > 0) {
      const entitlements = resolveLicenseEntitlements('trial');
      return {
        tier: 'trial',
        source: 'trial',
        exp: null,
        trialDaysRemaining,
        features: entitlements.features,
        limits: entitlements.limits,
        licenseId: null,
        activatedAt: trial.startedAt,
      };
    }

    return this.buildFreeStatus('none');
  }

  /**
   * 激活 Pro License。
   * @param code 用户粘贴的激活码
   */
  activate(code: string): LicenseActivateResult {
    const payload = verifyLicenseCode(code, this.publicKeyPem);
    const activatedAt = new Date().toISOString();
    const record: StoredLicenseRecord = { code: code.trim(), payload, activatedAt };
    fs.mkdirSync(path.dirname(this.licenseFilePath), { recursive: true });
    fs.writeFileSync(this.licenseFilePath, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });

    const status = this.getStatus();
    const expiryText = payload.tier === 'lifetime' ? '终身有效' : `有效期至 ${payload.exp}`;
    return {
      status,
      message: `Pro 已激活（${expiryText}，编号 ${payload.lid}）`,
    };
  }

  /**
   * 清除已保存的 License（仅开发/测试用途）。
   */
  clearLicense(): void {
    try {
      fs.unlinkSync(this.licenseFilePath);
    } catch {
      // 文件不存在时忽略
    }
  }

  /**
   * 判断当前是否拥有指定 Pro 能力。
   * @param feature 能力标识
   */
  hasFeature(feature: LicenseFeature): boolean {
    return this.getStatus().features.includes(feature);
  }

  /**
   * 要求指定 Pro 能力，不满足时抛出 LicenseError。
   * @param feature 能力标识
   */
  assertFeature(feature: LicenseFeature): void {
    if (this.hasFeature(feature)) return;

    const messages: Record<LicenseFeature, string> = {
      ai_review: 'AI 助手与复盘草稿为 Pro 功能，请在设置中激活或升级',
      portfolio_dividend_sync: '分红同步为 Pro 功能，请在设置中激活或升级',
      unlimited_plans: '免费版最多 3 个交易计划，请激活 Pro 后继续使用',
      unlimited_alerts: '免费版最多 5 条提醒，请激活 Pro 后继续使用',
      watchlist_all_pools: '该自选池为 Pro 功能，请在设置中激活或升级',
    };
    throw new LicenseError('LICENSE_FEATURE_REQUIRED', messages[feature]);
  }

  /**
   * 校验计划数量是否已达免费版上限。
   * @param currentCount 当前计划总数
   */
  assertCanCreatePlan(currentCount: number): void {
    const { limits } = this.getStatus();
    if (limits.maxPlans === null) return;
    if (currentCount >= limits.maxPlans) {
      throw new LicenseError(
        'LICENSE_LIMIT_REACHED',
        `免费版最多 ${limits.maxPlans} 个交易计划，请激活 Pro 后继续使用`,
      );
    }
  }

  /**
   * 校验提醒数量是否已达免费版上限。
   * @param currentCount 当前提醒总数
   */
  assertCanCreateAlert(currentCount: number): void {
    const { limits } = this.getStatus();
    if (limits.maxAlerts === null) return;
    if (currentCount >= limits.maxAlerts) {
      throw new LicenseError(
        'LICENSE_LIMIT_REACHED',
        `免费版最多 ${limits.maxAlerts} 条提醒，请激活 Pro 后继续使用`,
      );
    }
  }

  /**
   * 判断自选池是否对当前用户开放。
   * @param poolId 自选池 id
   */
  assertWatchlistPoolAllowed(poolId: WatchlistPoolId): void {
    if (this.hasFeature('watchlist_all_pools')) return;
    if (FREE_WATCHLIST_POOLS.includes(poolId)) return;
    this.assertFeature('watchlist_all_pools');
  }

  private buildFreeStatus(source: LicenseSource): LicenseStatus {
    const entitlements = resolveLicenseEntitlements('free');
    return {
      tier: 'free',
      source,
      exp: null,
      trialDaysRemaining: null,
      features: entitlements.features,
      limits: entitlements.limits,
      licenseId: null,
      activatedAt: null,
    };
  }

  private readStoredLicense(): StoredLicenseRecord | null {
    try {
      const raw = fs.readFileSync(this.licenseFilePath, 'utf8');
      const parsed = JSON.parse(raw) as StoredLicenseRecord;
      if (!parsed?.code || !parsed.payload) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private ensureTrialRecord(): TrialRecord {
    const existing = this.readTrialRecord();
    if (existing) return existing;

    const record: TrialRecord = { startedAt: new Date().toISOString() };
    fs.mkdirSync(path.dirname(this.trialFilePath), { recursive: true });
    fs.writeFileSync(this.trialFilePath, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    return record;
  }

  private readTrialRecord(): TrialRecord | null {
    try {
      const raw = fs.readFileSync(this.trialFilePath, 'utf8');
      const parsed = JSON.parse(raw) as TrialRecord;
      if (!parsed?.startedAt) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private getTrialDaysRemaining(startedAt: string): number {
    const started = new Date(startedAt);
    const elapsedMs = Date.now() - started.getTime();
    const elapsedDays = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));
    return Math.max(0, TRIAL_DAYS - elapsedDays);
  }
}
