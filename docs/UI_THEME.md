# UI 主题配置

## 主题方向

当前主题采用“专业金融编辑台”方向：以冷灰画布承载高密度信息，以深墨色建立文字层级，以钴蓝色
表达可操作状态。视觉保持克制、清晰和长期可读，不依赖装饰性渐变或在线字体。

主题服务于 Windows 与 macOS 中文桌面端，优先保证以下体验：

- 表格、表单和统计数据在长时间使用下仍然清晰。
- 数字采用等宽数字特性，金额、版本号和指标纵向对齐。
- 控件密度适合桌面操作，不沿用移动端的大尺寸间距。
- 浮层、边框和背景以明度区分层级，不堆叠重阴影。
- 中国市场默认使用红涨绿跌，但不污染成功、警告、错误等系统状态语义。

## 配置结构

```text
src/renderer/
├── theme/
│   ├── theme-config.json      # Ant Design Token 单一数据源
│   ├── index.ts               # 运行时 ThemeConfig，启用 zeroRuntime
│   └── market-colors.ts       # 盈亏方向色和图表序列色
└── styles/
    ├── antd-theme.css         # 自动生成的 Ant Design 静态主题
    ├── theme.css              # 应用级 CSS 变量、间距和表面规范
    └── global.css             # 页面基础样式，只消费主题变量

scripts/
└── generate-theme-css.mjs     # 静态主题生成器
```

`theme-config.json` 同时被 React Provider 和静态生成器读取，防止运行时 Token 与构建产物出现两份
配置。`antd-theme.css` 是生成文件，不应手工编辑。

## 色彩语义

| 语义      | Token                                | 默认值    | 使用范围                     |
| --------- | ------------------------------------ | --------- | ---------------------------- |
| 主要交互  | `colorPrimary` / `--td-color-accent` | `#2f5bd7` | 主按钮、链接、选中态         |
| 正向状态  | `colorSuccess`                       | `#16845b` | 保存成功、同步完成、服务正常 |
| 警告状态  | `colorWarning`                       | `#b76e14` | 风险提示、待确认状态         |
| 错误状态  | `colorError`                         | `#c23d4b` | 操作失败、校验错误、危险操作 |
| 盈利/上涨 | `--td-color-profit`                  | `#c23d4b` | 盈亏和行情方向，仅限交易业务 |
| 亏损/下跌 | `--td-color-loss`                    | `#16845b` | 盈亏和行情方向，仅限交易业务 |
| 持平      | `--td-color-flat`                    | `#6b7280` | 无涨跌、无方向数据           |

`colorSuccess` 与亏损色目前数值接近，但语义入口不同。组件状态必须使用 Ant Design 状态 Token；
盈亏展示必须使用 `marketColors` 或 `--td-color-profit/loss`，不能根据颜色值反推业务语义。

## 字体与数字

中文界面字体按以下顺序回退：MiSans、HarmonyOS Sans SC、苹方、微软雅黑 UI、微软雅黑。项目不访问
在线字体服务，因此离线环境和严格 CSP 下也能稳定显示。

金额、百分比、时间、版本号和统计指标使用 `--td-font-numeric`，并启用
`font-variant-numeric: tabular-nums`。正文不要全局使用等宽字体。

### 数字排版（强制）

数值展示的**格式**见 [数值展示规范](NUMBER_FORMAT.md)，**排版**遵循以下 Token 与类名：

| Token / 类名 | 用途 | 默认值 |
| --- | --- | --- |
| `--td-font-numeric` | 金额、份额、指标数字 | 中文 sans + `tabular-nums`（非等宽 mono） |
| `--td-numeric-letter-spacing` | 普通数字字距 | `0.02em` |
| `--td-currency-letter-spacing` | 含 `¥` / `+/-` 的金额 | `0.03em` |
| `--td-numeric-weight` | 指标数字字重 | `700` |
| `.td-value` | 所有用户可见格式化数字 | 统一字体 + 字距 |

**禁止**

- 在数字、金额、`.td-value`、指标卡 `strong`、`.ant-statistic-content` 上使用**负** `letter-spacing`
- 对金额使用 `font-weight: 780` 等超粗字重（改用 `--td-numeric-weight`）
- 在页面 CSS 中为单个模块重写数字字体/字距（应改 Token 或 preset）

**必须**

- React 数字 UI 使用 `<ValueDisplay kind="…" />`（见 NUMBER_FORMAT.md）
- Ant Design `Statistic` 金额使用 `formatter={statisticCurrencyFormatter}` 或内嵌 `ValueDisplay`
- 指标区容器（`.portfolio-metric-card`、`.journal-stats`、`.portfolio-summary-grid` 等）已内置排版，不要覆盖

修改字距/字重时只改 `theme.css` 中上述 Token，并运行 `npm run check`。

## 间距与圆角

应用级间距基于 4px 网格，通过 `--td-space-1` 到 `--td-space-12` 使用。普通控件圆角为 6px，
面板圆角为 10px。新增页面优先复用变量，不增加只服务于单个页面的近似数值。

## 修改主题

修改 Ant Design 组件 Token：

1. 编辑 `src/renderer/theme/theme-config.json`。
2. 执行 `npm run theme:generate`。
3. 执行 `npm run check` 和 `npm run build`。

`npm run dev` 和 `npm run build` 会自动先生成主题 CSS。应用级表面、间距或业务色分别修改
`theme.css` 和 `market-colors.ts`，不要编辑生成的 `antd-theme.css`。

## 后续扩展

当前只提供浅色主题。增加深色主题时，应创建独立 Token 配置并由静态生成器同时提取两个作用域，
再通过用户设置切换根作用域；不要直接在页面中反转颜色。图表组件应统一从 `chartColors` 读取序列色。
