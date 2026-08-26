# 交易日记

这是一个面向 Windows 和 macOS 的桌面应用工程骨架，包含：

- Electron + electron-vite + React + TypeScript
- React Router 声明式路由，使用 HashRouter 适配 Electron 本地协议
- Ant Design 6 中文组件体系与金融桌面主题，使用静态样式模式适配 Electron CSP
- 独立的 Node.js Utility Process，用于接入第三方 API 和执行后台任务
- Electron 内置的 `node:sqlite` 与版本化数据库迁移
- 基于内容哈希的文件化图片仓库与 WebP 预览图
- Windows 应用内自动更新与 macOS GitHub Release 手动更新
- 使用 electron-builder 构建 macOS DMG/ZIP 和 Windows NSIS 安装包

当前渲染进程只包含工程冒烟验证页，不代表产品界面或信息架构。

## 目录结构

```text
trading-diary/
├── src/
│   ├── main/                         # Electron 主进程
│   │   ├── index.ts                  # 应用启动、单实例和生命周期管理
│   │   ├── window.ts                 # 主窗口与渲染进程安全配置
│   │   ├── ipc.ts                    # 渲染进程 IPC 注册与来源校验
│   │   ├── protocols.ts              # app:// 和 app-asset:// 自定义协议
│   │   ├── updater/
│   │   │   ├── update-manager.ts     # 跨平台更新检查与状态机
│   │   │   └── update-policy.ts      # Windows 与 macOS 更新引擎分流策略
│   │   └── service-host.ts           # Utility Process 启停与请求管理
│   ├── preload/
│   │   └── index.ts                  # 向渲染进程暴露最小类型化 API
│   ├── renderer/                     # React 渲染进程
│   │   ├── index.html                # HTML 入口与内容安全策略
│   │   ├── src.tsx                   # React 挂载入口
│   │   ├── global.d.ts               # window.desktop 全局类型声明
│   │   ├── components/               # 可复用 UI 组件
│   │   ├── pages/                    # 路由级页面
│   │   ├── providers/
│   │   │   └── AppProviders.tsx      # Ant Design 中文配置与应用级上下文
│   │   ├── theme/
│   │   │   ├── theme-config.json     # Ant Design Token 单一数据源
│   │   │   ├── index.ts              # 运行时主题配置
│   │   │   └── market-colors.ts      # 盈亏方向色与图表序列色
│   │   ├── lib/                      # 渲染进程工具函数
│   │   ├── styles/
│   │   │   ├── antd-theme.css        # 自动生成的 Ant Design 静态主题
│   │   │   ├── theme.css             # 应用级主题变量
│   │   │   └── global.css            # 消费主题变量的全局样式
│   │   └── router/
│   │       ├── index.tsx             # HashRouter 与集中路由表
│   │       └── paths.ts              # 统一维护客户端路径常量
│   ├── service/                      # 独立后台服务进程
│   │   ├── index.ts                  # Utility Process 消息入口
│   │   ├── app-service.ts            # 后台服务请求分发
│   │   ├── assets/
│   │   │   └── image-store.ts        # 图片哈希、分片、预览和去重
│   │   ├── connectors/
│   │   │   └── connector.ts          # 第三方 API 连接器基础契约
│   │   └── database/
│   │       ├── database.ts           # SQLite 连接与数据访问
│   │       └── migrations.ts         # 数据库结构迁移
│   └── shared/
│       ├── ipc-channels.ts           # IPC channel 常量
│       ├── api.types.ts              # preload / renderer 共享 API 类型
│       ├── service.types.ts          # 后台服务消息与请求类型
│       ├── service.schemas.ts        # 后台服务 Zod 校验 schema
│       └── electron-vite.d.ts        # electron-vite 模块类型补充
├── tests/
│   ├── database.test.ts              # 数据库迁移与聚合测试
│   ├── image-store.test.ts           # 图片存储、预览和去重测试
│   └── update-policy.test.ts         # 更新平台分流与 Release 地址测试
├── docs/
│   ├── ARCHITECTURE.md               # 进程、存储和打包架构说明
│   ├── AUTO_UPDATE.md                # 自动更新构建、发布与验收说明
│   ├── CLIENT_UPDATE_FLOW.md         # Windows 与 macOS 客户端更新流程
│   ├── UI_COMPONENTS.md              # UI 组件库选型与开发约定
│   └── UI_THEME.md                   # UI 主题 Token、语义和扩展规范
├── resources/                        # 图标、权限配置等打包资源
├── scripts/
│   ├── generate-theme-css.mjs        # Ant Design 静态主题生成器
│   └── release.mjs                   # 版本递增、更新说明和一键发布
├── electron.vite.config.ts           # 主进程、preload、渲染进程构建配置
├── electron-builder.yml              # Windows 和 macOS 打包配置
├── electron-builder.config.cjs       # GitHub Releases 发布与更新源配置
├── electron-builder.env.example      # GH_TOKEN 等发布环境变量示例
├── eslint.config.mjs                 # ESLint 规则
├── vitest.config.ts                  # Vitest 测试配置
├── tsconfig.json                     # TypeScript 项目引用入口
├── tsconfig.node.json                # Node.js/Electron TypeScript 配置
├── tsconfig.web.json                 # React 渲染进程 TypeScript 配置
├── package.json                      # 依赖、命令和项目元数据
├── package-lock.json                 # npm 依赖锁文件
├── .editorconfig                     # 编辑器基础格式约定
└── .gitignore                        # Git 忽略规则
```

以下目录由开发或打包命令生成，不提交到 Git：

- `node_modules/`：npm 依赖
- `out/`：electron-vite 构建产物
- `dist/`：electron-builder 打包产物
- `.local-data/`：测试或手动运行产生的本地应用数据

## 环境要求

- Node.js 22.22 或更高版本，推荐使用 Node.js 24 LTS
- npm 11
- 构建 macOS 安装包需要 macOS
- 生产级 Windows 安装包建议在 Windows 或兼容的交叉构建环境中生成

## 常用命令

```bash
npm install
npm run dev
npm run theme:generate
npm run check
npm run build
npm run package
npm run dist:mac
npm run dist:win
npm run release            # 一键发布（推荐）
npm run dist:mac:publish   # 本地构建并上传到 GitHub Releases
```

`npm run package` 用于生成本地目录包。在 macOS 上会使用 ad-hoc 签名，避免修改 Electron
fuses 后留下无效签名。当前 macOS 版本不使用付费 Developer ID，发布后由用户手动安装 DMG。

更新通过 **GitHub Releases** 分发，无需自建服务器。Windows 支持应用内下载和安装；macOS
只检查版本并打开对应 Release 下载页。推送 `v*` tag 会触发
`.github/workflows/release.yml` 自动构建发布；也可本地配置 `GH_TOKEN` 后执行
`dist:*:publish`。客户端运行时状态、平台分支和故障处理详见
[客户端更新流程](docs/CLIENT_UPDATE_FLOW.md)，构建与发布配置详见
[自动更新配置](docs/AUTO_UPDATE.md)。

UI 组件库的方案对比、Ant Design 接入结构和开发约定详见
[UI 组件库选型](docs/UI_COMPONENTS.md)，主题 Token、交易方向色和扩展规则详见
[UI 主题配置](docs/UI_THEME.md)。

进程边界、本地存储、第三方连接器和打包方案详见
[架构说明](docs/ARCHITECTURE.md)。
