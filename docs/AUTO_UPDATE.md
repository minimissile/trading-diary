# 自动更新配置

项目使用 `electron-updater` 和 electron-builder 的 Generic Provider 完成 Windows 与
macOS 自动更新。客户端不调用 `setFeedURL`，更新地址由构建阶段生成的
`app-update.yml` 提供。

## 运行策略

- 开发环境不访问更新服务器。
- 未配置 `UPDATE_BASE_URL` 的安装包可以正常构建和运行，但自动更新保持禁用。
- 已配置更新服务的正式包会在启动 10 秒后检查一次更新，也可以由用户手动检查。
- 发现新版本后不自动下载；下载完成后不自动安装，必须由用户确认“退出并安装”。
- 更新状态和操作通过 preload 的类型化 IPC 暴露，渲染进程不能直接访问
  `electron-updater`。

## 构建环境

复制示例文件并填写静态更新服务器地址：

```bash
cp electron-builder.env.example electron-builder.env
```

```dotenv
UPDATE_BASE_URL=https://updates.example.com/trading-diary
UPDATE_CHANNEL=latest
```

`electron-builder.env` 已加入 Git 忽略列表。也可以直接通过 CI 环境变量提供相同配置。
更新地址应指向一个可公开读取的 HTTPS 目录，不要以 `latest.yml` 等具体文件名结尾。

## 构建与发布

1. 更新 `package.json` 中的版本号。
2. 配置代码签名、公证凭据和 `UPDATE_BASE_URL`。
3. 在对应平台执行 `npm run dist:mac` 或 `npm run dist:win`。
4. 将本次构建生成的安装包、更新元数据和 blockmap 文件完整上传到同一更新目录。
5. 确认文件可通过 HTTPS 读取后，再向用户发布新版本。

稳定通道通常包含以下文件，实际名称以 `dist/` 产物为准：

```text
updates.example.com/trading-diary/
├── latest.yml                         # Windows 更新元数据
├── Trading Diary-1.1.0-win-x64.exe
├── Trading Diary-1.1.0-win-x64.exe.blockmap
├── latest-mac.yml                     # macOS 更新元数据
├── Trading Diary-1.1.0-mac-x64.zip
├── Trading Diary-1.1.0-mac-arm64.zip
├── Trading Diary-1.1.0-mac-x64.dmg
└── Trading Diary-1.1.0-mac-arm64.dmg
```

不要只上传 DMG 或 EXE。更新元数据、ZIP 和 blockmap 等文件是客户端发现更新及差分下载所需
的发布资产。

## 平台要求

### macOS

- 自动更新只适用于已使用 Developer ID 签名的应用。
- 当前同时构建 DMG 和 ZIP；ZIP 是 macOS 自动更新元数据所需的发布资产。
- 正式发布应完成 Apple 公证，不要把 `npm run package` 生成的 ad-hoc 签名包用于线上更新。

### Windows

- 当前使用 NSIS 安装器，支持 electron-updater。
- 正式发布强烈建议使用稳定的代码签名证书，避免 SmartScreen 警告，并保证更新来源可信。
- 同一更新通道应保持一致的签名身份和应用 ID。

## 更新通道与回滚

`UPDATE_CHANNEL` 默认是 `latest`。如果后续引入 `beta`，应为不同通道使用独立目录，避免稳定版
客户端读取测试版本。发布错误版本时优先发布一个更高版本号的修复包；不要直接替换同版本文件，
否则客户端缓存和文件哈希可能不一致。

## 验收建议

自动更新必须使用已安装的签名包进行端到端验证，不能只在 `npm run dev` 中验证。建议准备一个
独立测试通道：先安装较低版本，再发布较高版本，依次检查发现更新、下载进度、退出安装、重新启动
和版本号变化。
