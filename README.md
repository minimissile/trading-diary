# Trading Diary 桌面运行时

这是一个面向 Windows 和 macOS 的桌面应用工程骨架，包含：

- Electron + electron-vite + React + TypeScript
- React Router 声明式路由，使用 HashRouter 适配 Electron 本地协议
- 独立的 Node.js Utility Process，用于接入第三方 API 和执行后台任务
- Electron 内置的 `node:sqlite` 与版本化数据库迁移
- 基于内容哈希的文件化图片仓库与 WebP 预览图
- 基于 electron-updater 的受控自动更新与类型化 IPC 状态通知
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
│   │   │   └── update-manager.ts     # 自动更新检查、下载和安装状态机
│   │   └── service/
│   │       └── service-host.ts       # Utility Process 启停与请求管理
│   ├── preload/
│   │   └── index.ts                  # 向渲染进程暴露最小类型化 API
│   ├── renderer/                     # React 渲染进程
│   │   ├── index.html                # HTML 入口与内容安全策略
│   │   ├── src.tsx                   # React 挂载入口
│   │   ├── global.d.ts               # window.desktop 全局类型声明
│   │   ├── router/
│   │   │   ├── index.tsx             # HashRouter 与集中路由表
│   │   │   └── paths.ts              # 统一维护客户端路径常量
│   │   └── ui/
│   │       ├── App.tsx               # 工程冒烟验证页
│   │       ├── NotFoundPage.tsx       # 未匹配路由的中文兜底页
│   │       └── styles.css             # 验证页基础样式
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
│       ├── contracts.ts              # IPC 与后台服务共享类型契约
│       └── electron-vite.d.ts        # electron-vite 模块类型补充
├── tests/
│   ├── database.test.ts              # 数据库迁移与聚合测试
│   └── image-store.test.ts           # 图片存储、预览和去重测试
├── docs/
│   ├── ARCHITECTURE.md               # 进程、存储和打包架构说明
│   └── AUTO_UPDATE.md                # 自动更新构建、发布与验收说明
├── resources/                        # 图标、签名配置等打包资源
├── electron.vite.config.ts           # 主进程、preload、渲染进程构建配置
├── electron-builder.yml              # Windows 和 macOS 打包配置
├── electron-builder.config.cjs       # 按环境注入 Generic 更新服务器配置
├── electron-builder.env.example      # 自动更新构建环境变量示例
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
- 构建签名及公证后的 macOS 安装包需要 macOS
- 生产级 Windows 安装包建议在 Windows 或兼容的交叉构建环境中生成

## 常用命令

```bash
npm install
npm run dev
npm run check
npm run build
npm run package
npm run dist:mac
npm run dist:win
```

`npm run package` 用于生成本地目录包。在 macOS 上会使用 ad-hoc 签名，避免修改 Electron
fuses 后留下无效签名。`dist:*` 是正式发布命令，使用构建环境提供的签名和公证凭据。

正式发布前复制 `electron-builder.env.example` 为 `electron-builder.env`，并填写
`UPDATE_BASE_URL`。未提供更新地址时仍可构建安装包，但不会生成 `app-update.yml`，客户端会
明确显示自动更新未配置。自动更新的服务器文件布局、签名要求和验收流程详见
[自动更新配置](docs/AUTO_UPDATE.md)。

进程边界、本地存储、第三方连接器和打包方案详见
[架构说明](docs/ARCHITECTURE.md)。
