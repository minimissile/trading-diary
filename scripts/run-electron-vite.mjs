#!/usr/bin/env node
/**
 * electron-vite 只读取 ELECTRON_EXEC_PATH，不会使用 ELECTRON_OVERRIDE_DIST_PATH。
 * 在 macOS 开发态注入定制 .app 的绝对路径，确保程序坞显示「交易日记」。
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? 'dev';

if (process.platform === 'darwin') {
  spawnSync(process.execPath, [path.join(root, 'scripts/prepare-dev-electron.mjs')], {
    cwd: root,
    stdio: 'inherit',
  });
}

const env = { ...process.env };
const devAppName = '交易日记.app';
const electronExec = path.join(root, '.electron-dev', devAppName, 'Contents/MacOS/Electron');

if (process.platform === 'darwin' && existsSync(electronExec)) {
  env.ELECTRON_EXEC_PATH = electronExec;
  console.log(`[dev-electron] ELECTRON_EXEC_PATH=${electronExec}`);
} else if (process.platform === 'darwin') {
  console.warn('[dev-electron] 未找到定制 Electron，可执行 node scripts/prepare-dev-electron.mjs');
}

const result = spawnSync('electron-vite', [mode], {
  cwd: root,
  env,
  stdio: 'inherit',
  shell: true,
});

process.exit(result.status ?? 1);
