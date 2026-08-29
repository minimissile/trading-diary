# 数值展示规范

> 状态：**已采纳** · 2026-08-29  
> 目标：全应用金额、价格、份额、涨跌幅展示口径一致，避免页面各自 `toFixed` 或手写 `¥` 拼接。

---

## 1. 单一入口（强制）

| 场景 | 用法 | 禁止 |
| --- | --- | --- |
| React 组件 / 表格列 | `<ValueDisplay kind="…" value={n} />` | `value.toFixed(2)`、`Intl.NumberFormat`、手动拼 `¥` |
| Ant Design `Statistic` 金额 | `formatter={statisticCurrencyFormatter}` 或内嵌 `ValueDisplay` | 把 `formatCurrency()` 字符串直接传给 `value` |
| 纯字符串（列表描述等） | `formatCurrency` / `formatSignedCurrency` | 直接调底层 `formatNumber` / `formatDisplayCurrency` |
| 持仓价格 / 份额 | `pricePresetForKind(kind)`、`quantityPresetForKind(kind)` | 全表统一写 `kind="price"` 或 `kind="quantity"` |

**源码位置**

```text
src/shared/format/number-format.ts      # 底层引擎（仅 format 模块内部扩展）
src/shared/format/display-presets.ts    # 预设定义（单一真相源）
src/renderer/components/trading/ValueDisplay.tsx
src/renderer/lib/trading-format.ts        # 渲染层统一 re-export
```

渲染进程业务代码只 import `../lib/trading-format`（或 `ValueDisplay`），不要跨层引用 `shared/format/*`。

---

## 2. 预设与示例

| 预设 `kind` | 用途 | 规则 | 正确示例 | 错误示例 |
| --- | --- | --- | --- | --- |
| `currency` | 市值、成本、投入等**普通金额** | **必须带 `¥`**；千分位；最多 2 位小数；**去末尾零** | `¥5,340`、`¥101.05` | `5,340`（缺符号）、`¥5,340.00`（多余 `.00`） |
| `pnl` | 浮动盈亏、已实现盈亏等**带符号金额** | `+/-` + **`¥`**；千分位；最多 2 位小数；去末尾零；涨跌色 | `+¥898.1`、`-¥12.3` | `+898.1`、`+¥898.10` |
| `priceStock` | A 股 / ETF / LOF **单价** | 固定 2 位小数；无千分位 | `8.90`、`2.66` | `8.9`、`8.900` |
| `priceFund` | 场外基金 **净值** | 最多 4 位小数；去末尾零；无千分位 | `1.149`、`1.002` | `1.1490` |
| `quantityShares` | 股票 / 场内 **份额** | 整数；可千分位 | `500`、`1,200` | `500.00` |
| `quantity` | 场外基金 **份额** | 最多 4 位小数；去末尾零 | `87.03` | `87.0300` |
| `percent` | 涨跌幅 | `+/-`；最多 2 位小数；`%`；涨跌色 | `+1.23%` | `1.23%`（缺符号） |

按标的类型选价格 / 份额预设：

```typescript
import { pricePresetForKind, quantityPresetForKind } from '../lib/trading-format';

<ValueDisplay kind={pricePresetForKind(row.kind)} value={row.avgCost} />
<ValueDisplay kind={quantityPresetForKind(row.kind)} value={row.quantity} />
```

`priceFund` / `quantity` 仅用于 `otc_fund`；其余标的用 `priceStock` / `quantityShares`。

---

## 3. 核心原则（不要违反）

1. **凡表示金额的 preset（`currency`、`pnl`）都必须保留 `¥`。** 去末尾零 ≠ 去掉货币符号。
2. **去末尾零**：整数金额不写 `.00`（`¥5,340` 而非 `¥5,340.00`）；有小数时保留有效位（`+¥898.1`）。
3. **新增展示场景**先加/复用 `DISPLAY_PRESETS` 条目，再在 UI 使用对应 `kind`；不要在新页面发明第二套规则。
4. **无效值**统一显示 `—`（由预设 fallback 处理），不要显示 `NaN`、`null`。
5. **涨跌色**仅通过 `ValueDisplay` 的 `pnl` / `percent` 或 `signedToneClass`；不要手写红绿 class。

---

## 4. 排版与视觉（强制）

格式正确但字距过紧仍视为缺陷。排版 Token 定义在 `src/renderer/styles/theme.css`：

- `--td-numeric-letter-spacing`：普通数字
- `--td-currency-letter-spacing`：含 `¥` / `+/-` 的金额（略宽）

**必须**

- 用户可见数字渲染为 `.td-value`（通过 `ValueDisplay` 自动附带）
- 指标卡、Statistic 网格使用已有容器类（`.portfolio-metric-card`、`.journal-stats`、`.portfolio-summary-grid` 等），其 CSS 已绑定上述 Token

**禁止**

- 对数字/金额使用负 `letter-spacing`（如 `-0.03em`）——仅允许用于页面大标题等非数字文案
- 在单个页面 CSS 重写数字字体或字距

详见 [UI 主题配置 · 数字排版](UI_THEME.md#数字排版强制)。

**标点可读性**：使用 `--td-font-numeric`（中文 sans + `tabular-nums`），兼顾紧凑与对齐；不在组件层拆分渲染分隔符。

---

## 5. 修改预设时的检查清单

- [ ] 更新 `src/shared/format/display-presets.ts`
- [ ] 更新 `tests/number-format.test.ts` 中对应断言与 **contract** 用例
- [ ] 运行 `npm run test -- tests/number-format.test.ts`
- [ ] 若影响 UI 组件约定，同步本文件与 [UI 组件约定](UI_COMPONENTS.md)

---

## 6. 相关文档

- [UI 主题配置](UI_THEME.md) — 数字字体、字距 Token
- [UI 组件约定](UI_COMPONENTS.md) — Ant Design 与页面结构
- [注释规范](COMMENTS.md) — export 与 JSDoc 要求
