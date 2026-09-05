# 公共 UI 组件规范

本轮以“股息与分红”精修样板为基准，统一公共组件；业务页面布局继续按页迭代。

## 维护入口

- `src/renderer/theme/theme-config.json`：Ant Design 运行时及静态样式的唯一主题源。
- `npm run theme:generate`：同时生成 `antd-theme.css` 和 `ui-tokens.css`，不要手工编辑生成文件。
- `src/renderer/styles/ui-components.css`：公共组件补充样式及组件样板布局。
- 开发路由 `#/dev/ui-components`：实际组件与交互状态样板，生产版本无该路由。
- `dividends.css`：分红业务布局与点亮墙，基础配色引用公共变量。

## 基础约定

| 项目 | 规范 |
| --- | --- |
| 主色 / 高亮文字 | #116976 / #78d3d8 |
| 次色 | #e3bb73，用于次要重点操作，不替代警告语义 |
| 页面 / 卡片 / 输入底色 | #0e181f / #16242d / #111d25 |
| 正文 / 次级 / 辅助 | #f3f8f9 / #bdcdd1 / #9db0b7 |
| 分隔 / 控件边框 | #344953 / #58727d，1px |
| 卡片 / 弹窗 / 浮层圆角 | 16px / 12px / 8px |
| 按钮 / 选择器 / Tab 圆角 | 6px / 6px / 4px |
| 输入、数字输入、日期输入、表格 | 直角 |
| 控件大 / 默认 / 小高度 | 40px / 36px / 28px |
| 列表图标按钮 | 32×32px，4px 圆角 |
| 数值、进度过渡 | 800ms，遵循系统减少动态效果设置 |

## 使用方式

优先直接使用 Ant Design 组件，无需再次套壳。不要在业务页重新设置全局 `.ant-*` 规则，不要用 `!important` 掩盖主题冲突。

- 主操作：`<Button type="primary">`。
- 次重点操作：`<Button className="ui-button-secondary">`。
- 方形图标操作：`<Button className="ui-icon-button" aria-label="操作名称" icon={...}>`。
- 卡片：`Card` 或 `.ui-panel`，不叠加双层外边框。
- 列表辅助文字：`.ui-cell-secondary`，顶部间距 2px。
- 成功、警告、处理中、失败分别使用 Tag 的 `success`、`warning`、`processing`、`error`。
- 数值动画沿用 `AnimatedValueDisplay`，跨 Tab 缓存必须提供唯一 `cacheKey`。
- 表单校验使用组件的 `status` / Form 验证状态，不覆盖状态边框；禁用与加载交给组件处理。

背景默认关闭；启用背景时卡片沿用 `--workspace-panel-glass`。交易涨跌色是独立业务语义，本轮未改红涨绿跌规则。

## 已接入的工作区

应用框架统一使用 72px 顶栏、36px 顶栏控件、青碧选中导航和暖金记录成交按钮；默认使用实色，开启背景时接入统一的石墨色玻璃层。

持仓中心、计划工作台和交易日记的页面细节在 `workspace-refinement.css` 中维护：统一页面间距、16px 主卡片、直角内部数据区、持仓表格操作按钮和复盘笔记换行。公共框架在 `yingji-glass.css` 中维护，分红页不再单独覆盖侧栏或顶栏尺寸。
