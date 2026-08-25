import type { UpdateDeliveryMode } from '../../shared/api.types';

const GITHUB_RELEASES_BASE_URL = 'https://github.com/minimissile/trading-diary/releases';

/**
 * macOS 未使用 Developer ID 时不允许 Squirrel.Mac 安装更新，改为引导用户手动安装 DMG。
 * Windows 继续使用 electron-updater 下载并安装 NSIS 更新。
 */
export function getUpdateDeliveryMode(platform: NodeJS.Platform): UpdateDeliveryMode {
  return platform === 'darwin' ? 'manual' : 'automatic';
}

/** 生成受控的 GitHub Release 地址，避免由渲染进程传入外部链接。 */
export function getReleasePageUrl(version: string): string {
  const normalizedVersion = version.replace(/^v/i, '');
  return `${GITHUB_RELEASES_BASE_URL}/tag/v${encodeURIComponent(normalizedVersion)}`;
}
