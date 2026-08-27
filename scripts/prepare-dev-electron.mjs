#!/usr/bin/env node
/**
 * 开发态 macOS 程序坞名称来自所启动 .app 的 Info.plist。
 * 必须使用 ditto 复制 .app（Node cpSync 会破坏 Framework 符号链接导致 icudtl.dat 找不到）。
 */
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_NAME = '交易日记';
const APP_BUNDLE_NAME = `${APP_NAME}.app`;
const EXECUTABLE_NAME = 'Electron';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readElectronVersion() {
  try {
    const pkg = JSON.parse(readFileSync(path.join(root, 'node_modules/electron/package.json'), 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

function patchInfoPlist(plistPath) {
  const buddy = '/usr/libexec/PlistBuddy';
  for (const [key, value] of [
    ['CFBundleDisplayName', APP_NAME],
    ['CFBundleName', APP_NAME],
  ]) {
    execFileSync(buddy, ['-c', `Set :${key} ${value}`, plistPath], { stdio: 'inherit' });
  }
}

function copyAppBundle(sourceApp, targetApp) {
  rmSync(targetApp, { recursive: true, force: true });
  execSync(`ditto "${sourceApp}" "${targetApp}"`, { stdio: 'inherit' });
}

if (process.platform !== 'darwin') {
  process.exit(0);
}

const sourceApp = path.join(root, 'node_modules/electron/dist/Electron.app');
if (!existsSync(sourceApp)) {
  console.warn('[dev-electron] 未找到 node_modules/electron/dist/Electron.app，跳过开发态程序坞名称配置');
  process.exit(0);
}

const devDist = path.join(root, '.electron-dev');
const targetApp = path.join(devDist, APP_BUNDLE_NAME);
const plistPath = path.join(targetApp, 'Contents/Info.plist');
const versionMarker = path.join(devDist, '.electron-version');
const currentVersion = readElectronVersion();
const previousVersion = existsSync(versionMarker) ? readFileSync(versionMarker, 'utf8').trim() : '';
const electronExec = path.join(targetApp, 'Contents/MacOS', EXECUTABLE_NAME);

const needsRefresh =
  !existsSync(targetApp) || previousVersion !== currentVersion || !existsSync(electronExec);

mkdirSync(devDist, { recursive: true });

if (needsRefresh) {
  console.log(`[dev-electron] ditto 同步 Electron.app → .electron-dev/${APP_BUNDLE_NAME}`);
  copyAppBundle(sourceApp, targetApp);
  writeFileSync(versionMarker, `${currentVersion}\n`);
}

patchInfoPlist(plistPath);

console.log(`[dev-electron] 开发态程序坞名称：${APP_NAME}`);
console.log(`[dev-electron] 可执行文件：${electronExec}`);
