import { existsSync } from 'node:fs';
import path from 'node:path';
import { app, nativeImage } from 'electron';
import { APP_NAME } from '../shared/brand';

function resolveAppIconPath(): string | null {
  const candidates = [
    path.join(process.resourcesPath, 'icon.png'),
    path.join(app.getAppPath(), 'resources', 'icon.png'),
    path.join(__dirname, '../../resources/icon.png'),
    path.join(process.cwd(), 'resources/icon.png'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

/** 设置应用显示名称（菜单栏 / About 面板等）。macOS 开发态程序坞名称需配合 scripts/prepare-dev-electron.mjs + ELECTRON_EXEC_PATH。 */
export function applyAppBranding(): void {
  app.setName(APP_NAME);

  if (process.platform === 'darwin') {
    app.setAboutPanelOptions({
      applicationName: APP_NAME,
      applicationVersion: app.getVersion(),
    });
  }
}

/** macOS 程序坞图标；开发态 Electron 默认不会使用打包 icon.icns。 */
export function applyDockBranding(): void {
  if (process.platform !== 'darwin' || !app.dock) return;

  const iconPath = resolveAppIconPath();
  if (!iconPath) {
    console.warn('[branding] 未找到 resources/icon.png，程序坞将沿用 Electron 默认图标');
    return;
  }

  const icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    console.warn('[branding] 无法加载程序坞图标', iconPath);
    return;
  }

  app.dock.setIcon(icon);
}

export function resolveWindowIconPath(): string | undefined {
  return resolveAppIconPath() ?? undefined;
}
