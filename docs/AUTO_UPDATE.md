# 自动更新配置

项目使用 `electron-updater` 和 electron-builder 的 **GitHub Releases Provider** 完成
Windows 与 macOS 自动更新。不需要自建更新服务器；发布资产托管在 GitHub Releases。

客户端不调用 `setFeedURL`，更新源由构建阶段写入的 `app-update.yml` 提供（指向
`minimissile/trading-diary` 的 GitHub Releases）。

## 运行策略

- 开发环境（`npm run dev`）不访问 GitHub。
- 正式安装包内置 `app-update.yml`，启动 10 秒后会检查 GitHub Releases 是否有新版本。
- 用户也可在应用内手动「检查更新」。
- 发现新版本后**不自动下载**；下载完成后**不自动安装**，需用户确认「退出并安装」。
- 更新状态通过 preload 的类型化 IPC 暴露，渲染进程不能直接访问 `electron-updater`。

## 前置条件

- GitHub 仓库：[minimissile/trading-diary](https://github.com/minimissile/trading-diary)
- 仓库需**公开**，或客户端需额外配置私有仓库 token（当前未实现，建议保持公开）。
- 发布时使用 **tag**（如 `v1.0.1`），且 `package.json` 中 `version` 与 tag 一致（不含 `v` 前缀）。

## 发布方式

### 方式 A：一键发布脚本（推荐）

项目内置 `scripts/release.mjs`，自动完成版本递增、整理 Git 提交为更新说明、提交打 tag，
并触发 GitHub Actions 构建 macOS / Windows 双平台产物。

**首次准备：**

```bash
cp electron-builder.env.example electron-builder.env
# 可选：GH_TOKEN（--local 本机发布时需要）
# 可选：OPENROUTER_API_KEY（启用 AI 生成更新说明，见 https://openrouter.ai/keys）
```

**最常用命令：**

```bash
# 1. 先 commit 所有待发布改动
# 2. 一键发布
npm run release
```

脚本会自动：

1. 将 `package.json` 版本 patch +1（也可用 `minor` / `major` / `--version 2.0.0`）
2. 自上一个 `v*` tag 提取 commit；配置了 `OPENROUTER_API_KEY` 时由 AI 决定 **patch / minor / major** 并生成更新说明，否则本地按 SemVer 推断
3. 写入 `release-notes.md` 与 `CHANGELOG.md`
4. 运行 `npm run check`
5. 提交、`git tag -a vX.Y.Z`
6. 推送后 GitHub Actions（`.github/workflows/release.yml`）构建并上传到 Releases

**其他用法：**

```bash
npm run release -- --dry-run              # 预览版本号与更新说明（本地整理，不消耗 token）
npm run release -- --dry-run --ai         # 预览 AI 生成的更新说明
npm run release -- patch --no-ai --push   # 强制本地整理，不用大模型
npm run release -- minor --push --yes     # minor 递增
npm run release -- --local --push --yes   # 本机构建当前平台并上传（需 GH_TOKEN）
npm run release -- --skip-check --push    # 跳过 check（不推荐）
```

本地模式（`--local`）在本机直接 `dist:mac:publish` 或 `dist:win:publish`；
CI 模式（默认）只推送 tag，由 Actions 在 macOS / Windows _runner 上分别构建，覆盖双平台。

### 方式 B：GitHub Actions（手动打 tag）

推送版本 tag 后自动构建并发布到 Releases：

```bash
# 1. 更新 package.json 版本号，例如 1.0.1
# 2. 提交并打 tag
git tag v1.0.1
git push origin main --tags
```

工作流文件：`.github/workflows/release.yml`

- 在 `macos-latest` 上构建 macOS 产物
- 在 `windows-latest` 上构建 Windows 产物
- 使用 `GITHUB_TOKEN` 上传到同一 GitHub Release

### 方式 C：本地手动发布

```bash
cp electron-builder.env.example electron-builder.env
# 填写 GH_TOKEN（classic token，勾选 repo 权限）

# macOS 本机构建并上传
npm run dist:mac:publish

# Windows 本机构建并上传
npm run dist:win:publish
```

仅构建安装包、不上传（仍写入 GitHub 更新源配置）：

```bash
npm run dist:mac
npm run dist:win
```

## 发布检查清单

1. 更新 `package.json` 的 `version`（如 `1.0.1`）。
2. 配置平台代码签名（macOS Developer ID + 公证；Windows 代码签名证书）。
3. 打 tag 并推送，或本地执行 `dist:*:publish`。
4. 在 GitHub Releases 页面确认产物完整，至少包含：
   - Windows：`latest.yml`、`.exe`、`.exe.blockmap`
   - macOS：`latest-mac.yml`、`.zip`（自动更新必需）、`.dmg`（用户手动安装用）
5. 用**较低版本的已安装包**做端到端验收：检查更新 → 下载 → 退出并安装 → 验证版本号。

Release 资产示例（名称以 `dist/` 实际产物为准）：

```text
GitHub Release v1.0.1
├── latest.yml
├── 交易日记-1.0.1-win-x64.exe
├── 交易日记-1.0.1-win-x64.exe.blockmap
├── latest-mac.yml
├── 交易日记-1.0.1-mac-x64.zip
├── 交易日记-1.0.1-mac-arm64.zip
├── 交易日记-1.0.1-mac-x64.dmg
└── 交易日记-1.0.1-mac-arm64.dmg
```

不要只上传 DMG 或 EXE。`latest*.yml`、ZIP 和 blockmap 是客户端发现更新及差分下载所需文件。

## 平台要求

### macOS

- 线上自动更新只适用于 **Developer ID 签名**且已完成 **Apple 公证** 的应用。
- ZIP 是 macOS 自动更新的必需资产；DMG 供用户首次手动安装。
- `npm run package` 生成的 ad-hoc 签名包不能用于线上更新验收。

### Windows

- 当前使用 NSIS 安装器，兼容 electron-updater。
- 正式发布强烈建议使用代码签名证书，减少 SmartScreen 拦截并保证更新链可信。

## 回滚与通道

- 默认发布到 GitHub **Release**（非 Draft）。
- 若需预发布版，设置环境变量 `GH_RELEASE_TYPE=prerelease`。
- 发布错误版本时，应发布**更高版本号**的修复包；不要覆盖同版本 Release 资产，否则哈希缓存可能不一致。

## 验收建议

自动更新必须在**已安装的签名正式包**上验证，不能只在 `npm run dev` 中测试。建议流程：

1. 安装 `v1.0.0` 正式包；
2. 发布 `v1.0.1` 到 GitHub Releases；
3. 在应用内检查更新 → 下载 → 安装 → 确认版本变为 `1.0.1`。
