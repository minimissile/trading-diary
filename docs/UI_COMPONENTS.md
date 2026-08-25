# UI 组件库选型与使用约定

## 选型结论

项目采用 **Ant Design 6**。当前安装版本为 `6.6.1`，作为渲染进程的基础 UI 组件库。

选型基于当前项目的实际约束：Windows 与 macOS 桌面端、React 19、中文用户、中文开发团队、
数据密集型业务、快速迭代，并且不限制安装包体积。

## 候选方案对比

| 方案         | 优势                                                                                 | 当前项目中的主要代价                                                               | 结论     |
| ------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | -------- |
| Ant Design 6 | 官方支持 React 18+ 与 Electron；中文国际化成熟；表格、表单、弹层、日期和反馈组件完整 | 默认视觉偏企业应用，需要后续用 Token 建立产品主题                                  | 采用     |
| Semi Design  | 面向桌面端企业应用，组件覆盖和中文文档良好                                           | React 19 需要在入口提前加载适配器，增加兼容约束                                    | 备选     |
| Arco Design  | 中文生态、MIT、组件较完整                                                            | React 19 的官方兼容说明和生态规模不如 Ant Design 明确                              | 不采用   |
| Material UI  | React 19 支持成熟，国际生态大                                                        | Material 视觉语言与中文数据桌面工具不完全匹配；部分高级 Data Grid 能力属于商业版本 | 不采用   |
| shadcn/ui    | React 19 兼容、源码可控、视觉自由度高                                                | 本质是把组件源码纳入项目维护，企业表格和复杂业务组件需要自行组合                   | 暂不采用 |

Ant Design 的官方环境列表直接包含 Electron，v6 不需要 React 19 兼容补丁；Table 支持虚拟滚动，
适合后续交易记录、同步任务和第三方数据列表。对当前快速迭代阶段而言，它能减少基础控件的重复开发，
也不会引入 MUI X 高级表格的商业授权决策。

## 接入结构

```text
src/renderer/
├── providers/
│   └── AppProviders.tsx    # 中文 locale、Ant Design App 上下文和样式策略
├── components/             # 使用 Ant Design 组合业务组件
├── pages/                  # 路由级页面
└── src.tsx                 # 静态样式和全局 Provider 入口
```

`AppProviders` 只挂载一次，并位于路由之外。这样 Modal、Message、Notification 等反馈能力可以通过
`App.useApp()` 获取同一份上下文，不使用脱离主题与国际化上下文的静态调用。

## 样式与 CSP 策略

项目启用 Ant Design 6 的 `zeroRuntime` 模式，并从 `antd/dist/antd.css` 引入预编译样式：

- 组件样式由 Vite 输出为同源 CSS 文件。
- 不依赖运行时 CSS-in-JS 注入 `<style>` 标签。
- 禁用按钮水波纹效果，避免为动画动态创建样式。
- CSP 继续限制 `style-src` 为 `'self'`；仅允许组件定位、尺寸和进度等所需的行内 style 属性。

当前没有建立产品视觉主题，因此不预设品牌色或组件级 Token。确定产品方向后，只在
`AppProviders.tsx` 集中增加 Token；如果主题超出默认静态 CSS，应使用
`@ant-design/static-style-extract` 生成对应静态样式，不应在页面里覆盖 Ant Design 内部 DOM 类名。

## 开发约定

- 通用交互优先使用 Ant Design 组件，不再编写同用途的原生 Button、Modal、Form 等实现。
- 用户可见的组件文案使用中文，日期相关页面继续复用全局 `zh_CN` 和 `dayjs/locale/zh-cn`。
- Message、Modal、Notification 使用 `App.useApp()` 返回的实例，不使用静态方法。
- 组件主题与全局配置统一放在 `AppProviders.tsx`，页面不得创建重复的顶层 ConfigProvider。
- 大数据表格优先启用 Table 的虚拟滚动并设置明确的横向、纵向滚动尺寸。
- 业务组件继续放在 `components/`，不要把页面状态或 IPC 调用封装进基础 UI 适配层。
- 避免依赖 `.ant-*` 内部节点层级；优先使用 Token、`classNames` 和 `styles` 语义化接口。
