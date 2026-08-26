# 客户端更新配置

项目使用 `electron-updater` 和 electron-builder 的 GitHub Releases Provider 发布更新，不需要
自建更新服务器。Windows 使用应用内自动更新；macOS 在没有 Developer ID 的阶段只检查版本，
并引导用户前往 GitHub Release 手动安装 DMG。

客户端不调用 `setFeedURL`，更新源由构建阶段写入的 `app-update.yml` 提供，固定指向
`minimissile/trading-diary` 的 GitHub Releases。

本文主要说明构建和发布配置；客户端启动后的状态流、平台分支、旧版本迁移和故障处理见
[客户端更新流程](CLIENT_UPDATE_FLOW.md)。

## 运行策略

- 开发环境（`npm run dev`）不访问 GitHub。
- 正式安装包启动 10 秒后检查更新，用户也可手动点击「检查更新」。
- Windows：发现新版本后由用户确认下载，下载完成后点击「退出并安装」。
- macOS：只使用 electron-updater 检查版本，不调用 Squirrel.Mac 下载或安装。
- macOS 发现新版本后显示「前往 GitHub 下载」，用户下载对应架构的 DMG 手动覆盖安装。
- 更新状态通过类型化 IPC 暴露，渲染进程不能直接访问 `electron-updater` 或传入任意外部 URL。

## 发布方式

### 一键发布

```bash
# 先提交所有待发布改动
npm run release
```

`scripts/release.mjs` 会递增版本号、整理提交记录、生成中文更新说明、运行 `npm run check`、提交
发布改动并创建 `vX.Y.Z` tag。推送 tag 后，`.github/workflows/release.yml` 在 macOS 和 Windows
runner 上构建并上传产物。

常用参数：

```bash
npm run release -- --dry-run
npm run release -- patch --no-ai --push
npm run release -- minor --push --yes
npm run release -- --local --push --yes
```

### 手动构建与发布

```bash
npm run dist:mac
npm run dist:win

# 配置 GH_TOKEN 后上传
npm run dist:mac:publish
npm run dist:win:publish
```

## Release 资产

至少确认以下文件存在：

```text
GitHub Release v1.3.0
├── latest.yml
├── trading-diary-1.3.0-x64-win.exe
├── trading-diary-1.3.0-x64-win.exe.blockmap
├── latest-mac.yml
├── trading-diary-1.3.0-x64-mac.zip
├── trading-diary-1.3.0-arm64-mac.zip
├── trading-diary-1.3.0-x64-mac.dmg
└── trading-diary-1.3.0-arm64-mac.dmg
```

Windows 的 `latest.yml`、EXE 和 blockmap 用于应用内更新。macOS 客户端只读取
`latest-mac.yml` 检查版本；ZIP 用于生成兼容更新元数据，但手动策略不会下载或安装它。DMG 用于
用户手动覆盖安装。

## macOS 限制

- 当前固定使用 ad-hoc 签名，不要求付费 Apple Developer ID。
- ad-hoc 签名不能获得 Apple 官方信任，首次安装可能需要右键打开，或在「系统设置 → 隐私与
  安全性」中确认。
- 不再调用 Squirrel.Mac 安装更新，因此不会再次触发 `Code signature did not pass validation`。
- 已安装的旧自动更新测试版需要先手动安装一次包含本策略的新版本。
- 下载 DMG 时必须选择与 CPU 匹配的 `arm64` 或 `x64` 版本。

## 验收流程

更新必须使用正式安装包验证：

1. 安装较低版本。
2. 发布更高版本并确认 Release 资产完整。
3. Windows：检查更新 → 下载 → 退出并安装 → 确认版本号更新。
4. macOS：检查更新 → 前往 GitHub 下载 → 安装对应架构 DMG → 确认版本号更新。
5. 确认数据库和图片仓库未因覆盖安装而丢失。

发布错误版本时应发布更高版本号的修复包，不要覆盖同版本 Release 资产，否则客户端和 GitHub
缓存可能继续使用旧文件。
