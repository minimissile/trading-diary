# 交易日记架构

## 运行时边界

```text
React 渲染进程
  -> 沙箱化 preload（精简的类型化 API）
  -> Electron 主进程（窗口、协议、系统对话框、IPC 鉴权）
  -> Electron Utility Process（连接器、任务、SQLite、图片处理）
       |-> SQLite：元数据、第三方服务状态、同步游标、任务队列
       `-> 文件仓库：原始图片和生成的预览图
```

渲染进程不会获得 Node.js、文件系统、数据库或任意网络访问权限。preload 只暴露
`src/shared/api.types.ts` 声明的 API。主进程 IPC 会验证请求是否来自主窗口的主 frame，
通过后才把类型化请求转发给后台服务。

生产环境通过受限的 `app://renderer/` 协议加载渲染文件，因此可以持续禁用 Electron 传统的
`file://` 额外权限。

## 存储目录

应用数据统一存放在 Electron 的 `userData` 目录：

```text
userData/
  database/
    app.sqlite
    app.sqlite-wal
    app.sqlite-shm
  assets/
    original/ab/cd/<sha256>.<ext>
    preview/ab/cd/<sha256>.webp
```

图片使用 SHA-256 内容哈希寻址。SQLite 保存可查询的元数据和本地绝对路径，图片二进制内容保留在
文件系统。导入时先写临时文件，完成后再通过重命名提交到目标位置。重复导入相同内容时复用已有文件
和数据库记录。

## 数据库与后台任务

后台服务使用 Electron 自带的 `node:sqlite`，不引入依赖 Electron ABI 的 SQLite 原生扩展。
数据库迁移按顺序和版本执行，并在事务中写入 `schema_migrations`。WAL 模式可在后台写入时保持
前台读取响应。

`provider_connections` 保存不敏感的连接器配置和同步游标。`jobs` 作为抓取、导入、重试和增量同步
任务的持久化边界。第三方服务密钥应通过操作系统凭据仓库适配器保存，不应直接写入 SQLite。

## 第三方连接器边界

每个第三方集成都需要实现 `src/service/connectors/connector.ts`。服务商 SDK、限流、分页、重试与
退避、响应校验都放在后台服务内。远程数据写入前先转换为内部领域命令，避免服务商原始结构泄漏到
界面或数据库契约中。

## 渲染层 UI 基础设施

渲染进程使用 Ant Design 6，并由 `src/renderer/providers/AppProviders.tsx` 统一提供中文 locale 和
应用级反馈上下文。组件 Token 位于 `src/renderer/theme/`，构建前通过官方静态提取工具生成 CSS，
以保持 Electron CSP 对动态 style 标签的限制。页面和业务组件不得直接访问 Node.js 或 Electron
API，仍然只能通过 preload 暴露的 `window.desktop` 接口调用主进程能力。具体选型和主题规范见
[UI 组件库选型](UI_COMPONENTS.md)与 [UI 主题配置](UI_THEME.md)。

## 构建与打包

`electron-vite` 负责构建主进程、preload、渲染进程和 Utility Process 入口。`electron-builder`
负责生成 macOS DMG/ZIP 与 Windows NSIS 目标。构建默认启用 ASAR 完整性校验和安全 fuses；
Sharp 原生二进制会从 ASAR 解包，并针对目标 Electron 运行时重新构建。在 macOS 上，只有隔离的
Utility Process 使用 Electron Plugin Helper，以便加载 Sharp 原生库。

更新由主进程的 `UpdateManager` 管理，并通过 `update-policy.ts` 按平台分流。Windows 使用
electron-updater 下载和安装 NSIS 更新；macOS 只检查版本，并由主进程打开受控的 GitHub Release
下载页，用户手动安装 DMG。正式构建通过 electron-builder 的 GitHub Releases Provider 生成
`app-update.yml`；推送 `v*` tag 或本地 `dist:*:publish` 即可发布。渲染进程始终只能通过 preload
暴露的类型化接口访问更新能力。完整发布流程见 [自动更新配置](AUTO_UPDATE.md)。
