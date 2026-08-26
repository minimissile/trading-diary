#!/usr/bin/env node
/**
 * 一键发布：递增版本号、整理 Git 提交为更新说明、构建并发布到 GitHub Releases。
 *
 * 用法：
 *   npm run release                    # 一键发布（AI 决定版本 + 更新说明 + 推送 tag）
 *   npm run release -- minor           # minor 递增
 *   npm run release -- --dry-run       # 预览，不执行
 *   npm run release -- --no-push       # 不推送到远程
 *
 * 环境变量（electron-builder.env）：
 *   GH_TOKEN            — 本地 --local 发布时需要
 *   OPENROUTER_API_KEY  — 可选，用 OpenRouter 大模型生成更新说明
 *   OPENROUTER_MODEL    — 可选，默认 ~deepseek/deepseek-v4-flash-latest
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { generateReleaseNotesWithLlm, generateReleasePlanWithLlm } from './llm-release.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PACKAGE_JSON = path.join(ROOT, 'package.json');
const CHANGELOG = path.join(ROOT, 'CHANGELOG.md');
const RELEASE_NOTES = path.join(ROOT, 'release-notes.md');
const ENV_FILE = path.join(ROOT, 'electron-builder.env');
const DEFAULT_OPENROUTER_MODEL = '~deepseek/deepseek-v4-flash-latest';

const COMMIT_GROUPS = {
  feat: '新功能',
  fix: '修复',
  docs: '文档',
  style: '样式',
  refactor: '重构',
  perf: '性能',
  test: '测试',
  build: '构建',
  ci: 'CI',
  chore: '其他',
};

const CONVENTIONAL_COMMIT = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?:\s*(?<subject>.+)$/i;

function run(command, options = {}) {
  const result = spawnSync(command, {
    cwd: ROOT,
    shell: true,
    stdio: options.inherit ? 'inherit' : 'pipe',
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    throw new Error(stderr || `命令失败 (${result.status}): ${command}`);
  }

  return result.stdout?.trim() ?? '';
}

function loadEnvFile() {
  if (!fs.existsSync(ENV_FILE)) return;

  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (key && !process.env[key]) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const args = {
    bump: null,
    version: null,
    explicitBump: false,
    mode: 'ci',
    dryRun: false,
    skipCheck: false,
    push: true,
    yes: true,
    ai: null,
    pushOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--skip-check') args.skipCheck = true;
    else if (arg === '--local') args.mode = 'local';
    else if (arg === '--ci') args.mode = 'ci';
    else if (arg === '--push') args.push = true;
    else if (arg === '--no-push') args.push = false;
    else if (arg === '--yes' || arg === '-y') args.yes = true;
    else if (arg === '--ai') args.ai = true;
    else if (arg === '--no-ai') args.ai = false;
    else if (arg === '--push-only') args.pushOnly = true;
    else if (arg === '--version') args.version = argv[++index];
    else if (['patch', 'minor', 'major'].includes(arg)) {
      args.bump = arg;
      args.explicitBump = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`一键发布脚本

用法：
  npm run release                       # AI 决定 patch/minor/major + 更新说明 + 推送
  npm run release -- patch              # 手动指定递增类型
  npm run release -- [patch|minor|major] [选项]

选项：
  --version <x.y.z>   指定版本号（跳过 AI 版本推断）
  --local             本机构建当前平台并上传到 GitHub Releases
  --no-push           不推送到 origin（默认会推送）
  --no-ai             不用大模型，本地整理 commit
  --push-only         仅推送已有 commit 与 tag（用于推送失败后重试）
  --dry-run           预览变更，不实际执行
  --skip-check        跳过 npm run check
  -h, --help          显示帮助

环境变量（写入 electron-builder.env）：
  OPENROUTER_API_KEY    配置后 AI 自动决定版本递增并生成更新说明
  GH_TOKEN              仅 --local 本机发布时需要
  OPENROUTER_MODEL      可选，默认 ~deepseek/deepseek-v4-flash-latest

示例：
  npm run release                       # 最常用
  npm run release -- --dry-run --ai       # 预览 AI 更新说明
  npm run release -- minor --no-push     # 仅本地 commit + tag
`);
}

function readPackageVersion() {
  return JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8')).version;
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`无效版本号：${version}`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function bumpVersion(current, bump) {
  const parts = parseVersion(current);
  if (bump === 'major') {
    parts.major += 1;
    parts.minor = 0;
    parts.patch = 0;
  } else if (bump === 'minor') {
    parts.minor += 1;
    parts.patch = 0;
  } else {
    parts.patch += 1;
  }
  return `${parts.major}.${parts.minor}.${parts.patch}`;
}

function getLastTag() {
  try {
    return run('git describe --tags --abbrev=0 --match "v*"');
  } catch {
    return null;
  }
}

function tagExists(tag) {
  try {
    run(`git rev-parse --verify --quiet ${tag}`);
    return true;
  } catch {
    return false;
  }
}

function isReleaseCommit(subject) {
  return /^chore(\(.+\))?:\s*(release|发布)/i.test(subject);
}

function collectCommits(lastTag) {
  const range = lastTag ? `${lastTag}..HEAD` : 'HEAD';
  const output = run(`git log ${range} --pretty=format:%s`);
  if (!output) return [];

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((subject) => !isReleaseCommit(subject));
}

function classifyCommit(subject) {
  const match = CONVENTIONAL_COMMIT.exec(subject);
  if (!match?.groups) {
    return { type: 'other', scope: null, subject, breaking: false };
  }

  return {
    type: match.groups.type.toLowerCase(),
    scope: match.groups.scope ?? null,
    subject: match.groups.subject.trim(),
    breaking: Boolean(match.groups.breaking),
  };
}

function formatCommitLine(commit) {
  const scope = commit.scope ? `（${commit.scope}）` : '';
  const breaking = commit.breaking ? ' **[破坏性变更]**' : '';
  return `- ${commit.subject}${scope}${breaking}`;
}

function buildReleaseNotes(version, commits) {
  const grouped = new Map();

  for (const subject of commits) {
    const commit = classifyCommit(subject);
    const type = COMMIT_GROUPS[commit.type] ? commit.type : 'other';
    if (!grouped.has(type)) grouped.set(type, []);
    grouped.get(type).push(commit);
  }

  const order = ['feat', 'fix', 'perf', 'refactor', 'docs', 'style', 'test', 'build', 'ci', 'chore', 'other'];
  const date = new Date().toISOString().slice(0, 10);
  const lines = [`## ${version} (${date})`, ''];

  if (commits.length === 0) {
    lines.push('- 维护性更新与改进');
    lines.push('');
    return lines.join('\n');
  }

  for (const type of order) {
    const items = grouped.get(type);
    if (!items?.length) continue;
    lines.push(`### ${COMMIT_GROUPS[type] ?? '其他'}`);
    lines.push('');
    for (const item of items) lines.push(formatCommitLine(item));
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

function hasOpenRouterKey() {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

function wantsAi(args, dryRun) {
  if (args.ai === false) return false;
  if (args.ai === true) return true;
  if (dryRun) return false;
  return hasOpenRouterKey();
}

function wantsAiPreview(args, dryRun) {
  return args.ai === true && dryRun && hasOpenRouterKey();
}

function inferBumpFromCommits(commits) {
  let bump = 'patch';

  for (const subject of commits) {
    const commit = classifyCommit(subject);
    if (commit.breaking || /BREAKING CHANGE/i.test(subject)) {
      return 'major';
    }
    if (commit.type === 'feat') bump = 'minor';
  }

  return bump;
}

function ensureNotesHeader(notes, version) {
  const date = new Date().toISOString().slice(0, 10);
  const header = `## ${version} (${date})`;
  const trimmed = notes.trim();

  if (/^##\s+\d+\.\d+\.\d+/m.test(trimmed)) {
    return trimmed.replace(/^##\s+[\d.]+(?:\s*\([^)]+\))?/m, header).trimEnd() + '\n';
  }

  return `${header}\n\n${trimmed}\n`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pushWithRetry(label, command, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      run(command, { inherit: true });
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      console.warn(`${label}失败（${attempt}/${attempts}），10 秒后重试…`);
      await sleep(10_000);
    }
  }
}

async function generateReleasePlanWithAi(currentVersion, lastTag, commits) {
  console.log('调用 OpenRouter 推断版本号并生成更新说明…');
  const parsed = await generateReleasePlanWithLlm(currentVersion, lastTag, commits);
  const nextVersion = bumpVersion(currentVersion, parsed.bump);
  const notes = ensureNotesHeader(parsed.releaseNotes.replaceAll('NEXT_VERSION', nextVersion), nextVersion);

  return {
    bump: parsed.bump,
    bumpReason: parsed.bumpReason?.trim() || '（无说明）',
    notes,
  };
}

async function resolveVersionPlan(args, currentVersion, lastTag, commits, dryRun) {
  if (args.version) {
    return {
      nextVersion: args.version,
      bump: null,
      bumpSource: 'manual（--version）',
      bumpReason: null,
      notes: null,
      notesSource: null,
    };
  }

  const useAi = wantsAi(args, dryRun) || wantsAiPreview(args, dryRun);
  const autoBump = !args.explicitBump;
  let aiAttempted = false;

  if (autoBump && useAi) {
    aiAttempted = true;
    try {
      const plan = await generateReleasePlanWithAi(currentVersion, lastTag, commits);
      return {
        nextVersion: bumpVersion(currentVersion, plan.bump),
        bump: plan.bump,
        bumpSource: 'ai',
        bumpReason: plan.bumpReason,
        notes: plan.notes,
        notesSource: 'ai',
      };
    } catch (error) {
      console.warn(`AI 发布计划失败，回退本地推断：${error.message}`);
    }
  }

  const bump = args.explicitBump ? args.bump : inferBumpFromCommits(commits);
  let bumpSource = args.explicitBump ? 'manual' : aiAttempted ? 'local（AI 失败回退）' : 'local';
  let bumpReason = null;

  if (autoBump && dryRun && hasOpenRouterKey() && args.ai !== false && !useAi) {
    bumpReason = '（dry-run 不调用 AI，加 --ai 可预览）';
  }

  return {
    nextVersion: bumpVersion(currentVersion, bump),
    bump,
    bumpSource,
    bumpReason,
    notes: null,
    notesSource: null,
  };
}

function wantsAiGeneration(args, dryRun) {
  if (args.ai === false) return false;
  if (args.ai === true) return true;
  if (dryRun) return false;
  return hasOpenRouterKey();
}

async function resolveReleaseNotes(args, version, lastTag, commits, dryRun) {
  const localNotes = buildReleaseNotes(version, commits);

  if (!wantsAiGeneration(args, dryRun)) {
    const hint =
      dryRun && process.env.OPENROUTER_API_KEY?.trim() && args.ai !== false
        ? 'local（dry-run 不调用 AI，加 --ai 可预览）'
        : 'local';
    return { notes: localNotes, source: hint };
  }

  try {
    const aiNotes = await generateReleaseNotesWithAi(version, lastTag, commits);
    return { notes: aiNotes, source: 'ai' };
  } catch (error) {
    console.warn(`AI 生成失败，回退本地整理：${error.message}`);
    return { notes: localNotes, source: 'local（AI 失败回退）' };
  }
}

async function generateReleaseNotesWithAi(version, lastTag, commits) {
  const model = process.env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL;
  console.log(`调用 OpenRouter（${model}）生成更新说明…`);
  return generateReleaseNotesWithLlm(version, lastTag, commits);
}

function prependChangelog(section) {
  const heading = '# 更新日志\n\n';
  const existing = fs.existsSync(CHANGELOG) ? fs.readFileSync(CHANGELOG, 'utf8') : heading;
  const body = existing.startsWith('#') ? existing.replace(/^#[^\n]*\n+/u, '') : existing;
  fs.writeFileSync(CHANGELOG, `${heading}${section}\n${body}`);
}

function assertCleanWorkingTree() {
  const status = run('git status --porcelain');
  if (status) {
    throw new Error('工作区有未提交改动，请先 commit 或 stash：\n' + status);
  }
}

function assertGhToken(mode) {
  if (mode === 'ci') return;
  loadEnvFile();
  if (!process.env.GH_TOKEN?.trim()) {
    throw new Error('本地发布需要 GH_TOKEN。请复制 electron-builder.env.example 为 electron-builder.env 并填入 token。');
  }
}

async function confirmPush(enabled) {
  if (enabled === true) return true;
  if (enabled === false) return false;
  if (!process.stdin.isTTY) return false;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise((resolve) => {
    rl.question('推送到 origin（含 tag）？[Y/n] ', resolve);
  });
  rl.close();

  return !answer || answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

function printPlan({
  args,
  currentVersion,
  nextVersion,
  lastTag,
  commits,
  notes,
  tag,
  notesSource,
  bump,
  bumpSource,
  bumpReason,
}) {
  console.log('\n=== 发布预览 ===');
  console.log(`当前版本：${currentVersion}`);
  console.log(`新版本：  ${nextVersion}${bump ? `（${bump}）` : ''}`);
  if (bumpSource) {
    console.log(`版本策略：${bumpSource}${bumpReason ? ` — ${bumpReason}` : ''}`);
  }
  console.log(`Git tag：  ${tag}`);
  console.log(`上一 tag：${lastTag ?? '（无）'}`);
  console.log(`提交范围：${lastTag ? `${lastTag}..HEAD` : 'HEAD'}（${commits.length} 条）`);
  console.log(`发布模式：${args.mode === 'local' ? '本机构建并上传' : '推送 tag，GitHub Actions 构建双平台'}`);
  console.log(`更新说明：${notesSource}${args.ai === false ? '（--no-ai）' : args.ai === true ? '（--ai）' : ''}`);
  console.log('\n--- 更新说明 ---\n');
  console.log(notes);
  console.log('--- 结束 ---\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnvFile();

  if (args.pushOnly) {
    const version = readPackageVersion();
    const tag = `v${version}`;
    if (!tagExists(tag)) {
      throw new Error(`本地不存在 tag ${tag}，请先完成发布或手动打 tag`);
    }

    console.log(`推送已有发布：${tag}`);
    await pushWithRetry('推送分支', 'git push origin HEAD');
    await pushWithRetry('推送 tag', `git push origin ${tag}`);
    console.log('\n✅ 推送完成');
    console.log('GitHub Actions：https://github.com/minimissile/trading-diary/actions');
    return;
  }

  const currentVersion = readPackageVersion();
  const lastTag = getLastTag();
  const commits = collectCommits(lastTag);

  const versionPlan = await resolveVersionPlan(args, currentVersion, lastTag, commits, args.dryRun);
  const nextVersion = versionPlan.nextVersion;
  parseVersion(nextVersion);

  const tag = `v${nextVersion}`;
  if (tagExists(tag)) {
    throw new Error(`tag ${tag} 已存在，请更换版本号或删除旧 tag`);
  }

  let notes = versionPlan.notes;
  let notesSource = versionPlan.notesSource;

  if (!notes) {
    const resolvedNotes = await resolveReleaseNotes(args, nextVersion, lastTag, commits, args.dryRun);
    notes = resolvedNotes.notes;
    notesSource = resolvedNotes.source;
  }

  printPlan({
    args,
    currentVersion,
    nextVersion,
    lastTag,
    commits,
    notes,
    tag,
    notesSource,
    bump: versionPlan.bump,
    bumpSource: versionPlan.bumpSource,
    bumpReason: versionPlan.bumpReason,
  });

  if (args.dryRun) {
    console.log('dry-run 模式，未做任何修改。');
    return;
  }

  if (nextVersion === currentVersion) {
    throw new Error('新版本与当前版本相同');
  }

  assertCleanWorkingTree();
  assertGhToken(args.mode);

  console.log(`递增版本至 ${nextVersion}…`);
  run(`npm version ${nextVersion} --no-git-tag-version --allow-same-version=false`, { inherit: true });

  fs.writeFileSync(RELEASE_NOTES, notes);
  prependChangelog(notes);

  if (!args.skipCheck) {
    console.log('运行 npm run format…');
    run('npm run format', { inherit: true });
    console.log('运行 npm run check…');
    run('npm run check', { inherit: true });
  }

  console.log('提交版本与更新说明…');
  run('git add package.json package-lock.json CHANGELOG.md release-notes.md', { inherit: true });
  run(`git commit -m "chore: release ${tag}"`, { inherit: true });
  run(`git tag -a ${tag} -F ${RELEASE_NOTES}`, { inherit: true });

  if (args.mode === 'local') {
    const publishScript = process.platform === 'win32' ? 'dist:win:publish' : 'dist:mac:publish';
    console.log(`本机构建并发布（${publishScript}）…`);
    run(`npm run ${publishScript}`, { inherit: true, env: { GH_TOKEN: process.env.GH_TOKEN } });
  }

  const shouldPush = args.yes ? args.push !== false : await confirmPush(args.push);
  if (shouldPush) {
    try {
      console.log('推送到 origin…');
      await pushWithRetry('推送分支', 'git push origin HEAD');
      await pushWithRetry('推送 tag', `git push origin ${tag}`);
    } catch (error) {
      console.error('\n⚠️ 本地发布已完成（commit + tag），但推送 GitHub 失败。');
      console.error(error.message);
      console.log('\n网络恢复或开启代理/VPN 后执行：');
      console.log('  npm run release -- --push-only');
      console.log('或：');
      console.log('  git push origin HEAD');
      console.log(`  git push origin ${tag}`);
      process.exit(1);
    }
  }

  console.log('\n✅ 发布流程完成');
  console.log(`版本：${nextVersion}`);
  console.log(`Tag： ${tag}`);

  if (args.mode === 'ci') {
    if (shouldPush) {
      console.log('\nGitHub Actions 正在为 macOS / Windows 构建并上传到 Releases。');
      console.log('查看进度：https://github.com/minimissile/trading-diary/actions');
    } else {
      console.log('\n下一步：git push origin HEAD && git push origin ' + tag);
    }
  } else if (!shouldPush) {
    console.log('\n下一步：git push origin HEAD && git push origin ' + tag);
  }

  console.log('\n客户端验收：Windows 验证应用内安装；macOS 验证跳转 Release 并手动安装 DMG。');
}

main().catch((error) => {
  console.error('\n❌ 发布失败：', error.message);
  process.exit(1);
});
