import type { LicenseStatus } from '../../shared/api.types';

/** 从 IPC 错误对象中提取可读 License 提示。 */
export function getLicenseErrorMessage(error: unknown, fallback = 'License 校验失败'): string {
  let message = fallback;
  if (error instanceof Error && error.message) message = error.message;
  else if (typeof error === 'object' && error !== null && 'message' in error) {
    const nested = (error as { message?: unknown }).message;
    if (typeof nested === 'string' && nested.trim()) message = nested;
  }

  const colonIndex = message.indexOf(': ');
  if (colonIndex > 0 && /^[A-Z_]+$/.test(message.slice(0, colonIndex))) {
    return message.slice(colonIndex + 2);
  }
  return message;
}

/** 当前是否为 Pro 能力（含试用、终身）。 */
export function isProEntitled(status: LicenseStatus | null): boolean {
  if (!status) return false;
  return status.tier === 'pro' || status.tier === 'trial' || status.tier === 'lifetime';
}

/** 格式化 License 档位展示文案。 */
export function formatLicenseTierLabel(status: LicenseStatus): string {
  switch (status.tier) {
    case 'lifetime':
      return 'Pro 终身版';
    case 'pro':
      return 'Pro 年费版';
    case 'trial':
      return `Pro 试用（剩余 ${status.trialDaysRemaining ?? 0} 天）`;
    default:
      return '免费版';
  }
}

/** 格式化 License 来源展示文案。 */
export function formatLicenseSourceLabel(status: LicenseStatus): string {
  switch (status.source) {
    case 'license':
      return '已激活 License';
    case 'trial':
      return '试用期';
    default:
      return '免费版';
  }
}

/** 根据档位返回 Tag 颜色。 */
export function getLicenseTagColor(status: LicenseStatus | null): string {
  if (!status) return 'default';
  switch (status.tier) {
    case 'lifetime':
      return 'gold';
    case 'pro':
      return 'green';
    case 'trial':
      return 'blue';
    default:
      return 'default';
  }
}

/** 格式化到期日展示。 */
export function formatLicenseExpiryLabel(status: LicenseStatus): string {
  if (status.tier === 'lifetime') return '终身有效';
  if (status.exp) return status.exp;
  if (status.tier === 'trial') return `试用剩余 ${status.trialDaysRemaining ?? 0} 天`;
  return '—';
}
