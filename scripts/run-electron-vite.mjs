#!/usr/bin/env node
/**
 * electron-vite 只读取 ELECTRON_EXEC_PATH，不会使用 ELECTRON_OVERRIDE_DIST_PATH。
 * 在 macOS 开发态注入定制 .app 的绝对路径，确保程序坞显示「交易日记」。
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devLog, devWarn, isDevVerbose } from './dev-quiet.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? 'dev';

function runStep(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: isDevVerbose() ? 'inherit' : 'pipe',
    encoding: 'utf8',
    ...options,
  });

  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }

  if (isDevVerbose() && result.stdout) process.stdout.write(result.stdout);
}

if (mode === 'dev') {
  runStep(process.execPath, [path.join(root, 'scripts/generate-theme-css.mjs')]);
}

function runPrepareDevElectron() {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/prepare-dev-electron.mjs')], {
    cwd: root,
    stdio: isDevVerbose() ? 'inherit' : 'pipe',
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }

  if (isDevVerbose() && result.stdout) process.stdout.write(result.stdout);
}

if (process.platform === 'darwin') {
  runPrepareDevElectron();
}

const env = { ...process.env };
const devAppName = '交易日记.app';
const electronExec = path.join(root, '.electron-dev', devAppName, 'Contents/MacOS/Electron');

if (process.platform === 'darwin' && existsSync(electronExec)) {
  env.ELECTRON_EXEC_PATH = electronExec;
  devLog(`[dev-electron] ELECTRON_EXEC_PATH=${electronExec}`);
} else if (process.platform === 'darwin') {
  devWarn('[dev-electron] 未找到定制 Electron，可执行 node scripts/prepare-dev-electron.mjs');
}

const electronViteArgs = [mode, '--logLevel', isDevVerbose() ? 'warn' : 'silent'];

const result = spawnSync('electron-vite', electronViteArgs, {
  cwd: root,
  env,
  stdio: 'inherit',
  shell: true,
});

process.exit(result.status ?? 1);
