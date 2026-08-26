# 持仓与股息模块设计（设计稿 v0.1）

> 状态：**待实施** · 2026-08-26  
> 目标：记录真实持仓，统计**持仓后实际获得**的股息，并可视化「分红够买什么」与分红日历。  
> 产品边界：不提供买卖建议；股息数据来自公开 API + 用户录入，不承诺与券商完全一致。

---

## 1. 设计目标

| 目标 | 说明 |
|------|------|
| **多标的类型** | A 股、ETF、LOF、场外开放式基金统一持仓模型 |
| **股息优先** | 页面首屏围绕「今年累计分红、预期分红、日均分红」组织，而非仅展示浮盈亏 |
| **持仓后口径** | 累计分红只统计**建仓之后、在册日仍持有**份额对应的分红，不做「假设一直持有」 |
| **可核对** | 每条分红可追溯到除权日、每股金额、持有份额与来源（API 同步 / 手工确认） |
| **架构合规** | 渲染进程经 `window.desktop.portfolio.*` 访问；行情与分红公告走已有 `MarketService` |
| **本地优先** | 持仓与已确认分红写入 SQLite；API 缓存可重建 |

### 非目标（首版不做）

- 券商账户直连、自动同步成交
- 税后进账金额精确到分（首版按**税前每股派息 × 持有份额**估算）
- 分红再投资（DRIP）自动拆股逻辑
- 向用户展示「再买 XX 就能点亮下一档」类诱导交易文案

---

## 2. 与现有模块的关系

```text
交易计划 (plans)          持仓模块 (portfolio)           自选池 (watchlist)
  等待入场 / 持仓中    →    可选：从计划一键建仓           观察用，不记账
  结束并复盘           →    可选：平仓写入交易回合
  提醒 (alerts)        →    可扩展：除权日前 N 天提醒（P1）

行情 (market.*)        →    resolve / getQuote / listDividends / getSnapshot
```

- **计划**回答「我准备怎么做」；**持仓**回答「我实际拿着什么、收到了多少分红」。
- 两者可关联 `plan_id`，但不强制：用户可手工录入无计划的持仓。
- 首页「持仓中」计划卡片可跳转持仓详情；持仓页不要求必须先有计划。

---

## 3. 信息架构

### 3.1 导航入口

| 入口 | 路径 | 说明 |
|------|------|------|
| 侧栏 | `/portfolio` | **持仓与股息**（主模块） |
| 子 Tab | 总览 / 持仓列表 / 分红日历 / 分红明细 | 同一页 Segmented 切换 |
| 首页 | 指挥台卡片 | 今年累计分红 + 最近 3 个点亮物（缩略） |

### 3.2 页面结构（推荐）

```text
┌─────────────────────────────────────────────────────────────┐
│ 持仓与股息                              [刷新行情] [录入持仓] │
├─────────────────────────────────────────────────────────────┤
│ ① 今年累计分红 ¥1,286.40    ② 预期分红 ¥420.00              │
│ ③ 日均分红 ¥5.28            ④ 持仓市值 ¥86,240（辅）        │
├─────────────────────────────────────────────────────────────┤
│ 【分红点亮墙】 已点亮 8 / 15 档                               │
│  🥚 ✅  🧈 ✅  🥬 ✅  🍱 ✅  🛢 ✅  🍚 ✅  🥛 ✅  🛏 ⬜ ...   │
├─────────────────────────────────────────────────────────────┤
│ [总览] [持仓列表] [分红日历] [分红明细]                        │
│ … Tab 内容 …                                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. 核心指标定义

### 4.1 今年累计分红（YTD Received）

**定义**：自然年 1 月 1 日 00:00（用户时区，默认 Asia/Shanghai）起，至当前时刻，所有**已确认**分红记录的税前金额之和。

**单条分红金额**：

```text
cash_amount = cash_per_share × eligible_quantity
```

其中 `eligible_quantity` 由 **除权除息日（ex_date）** 反推股权登记日的在持份额（A 股/场内基金见 §5.2）。

**状态**：

| 状态 | 计入累计？ | 说明 |
|------|------------|------|
| `confirmed` | ✅ | 用户确认或系统自动匹配成功 |
| `estimated` | ❌（单独展示） | 除权日已过、尚未到账，可在「待确认」区预览 |
| `projected` | ❌ | 仅用于「预期分红」，不计入累计 |

### 4.2 预期分红（Expected）

**定义**：当前持仓在未来 12 个月内、**已公告尚未除权**（及除权日在今天之后）的分红，按当前份额估算的税前合计。

数据来源优先级：

1. `market.listDividends` 中 `status ∈ {announced, proposed}` 且 `exDividendDate > today`
2. 若无公告，可选 fallback：最近一个完整年度每股派息 × 当前份额 × 置信度降权（UI 标注「基于历史估算」）

```text
expected = Σ (cash_per_share × current_quantity)   // 每条待实施公告
```

### 4.3 平均每日分红（Daily Average）

**定义**（首版固定口径，避免歧义）：

```text
daily_avg = ytd_received / max(1, days_elapsed_in_year)
```

- `days_elapsed_in_year`：当年 1 月 1 日至今天的**日历天数**（含当天）。
- 不采用「仅交易日」作为默认，避免休市期间数字跳变；设置页可提供「按交易日折算」开关（P1）。

### 4.4 辅助指标（总览 Tab）

| 指标 | 计算 |
|------|------|
| 持仓市值 | Σ (quantity × last_price)，价格来自 `market.getQuotes` |
| 持仓成本 | Σ (quantity × avg_cost) |
| 浮盈亏 | 市值 − 成本（**次要展示**，不与股息抢主视觉） |
| 股息率（持仓加权） | 预期年化分红 / 市值，或用 f133 加权 |
| 分红贡献率 | 今年累计分红 / (今年累计分红 + 浮盈亏)，仅当分母 > 0 时展示 |

---

## 5. 持仓与分红计算规则

### 5.1 份额流水（Lot Ledger）

首版采用 **FIFO 份额流水**，每次买入/卖出/分红再投写入一条 `portfolio_ledger`：

| 字段 | 说明 |
|------|------|
| `symbol` | 标准化代码 |
| `kind` | `stock \| etf \| lof \| otc_fund` |
| `side` | `buy \| sell \| dividend_reinvest` |
| `quantity` | 份额（卖出为负） |
| `price` | 成交价或再投净值 |
| `fees` | 手续费 |
| `trade_at` | 成交时间 ISO |
| `plan_id` | 可选，关联计划 |
| `source` | `manual \| csv \| plan` |

**当前份额** = 该 symbol 下所有 ledger 数量之和（未平仓账户）。

**平均成本**（展示用）：剩余 lot 的加权平均成本，卖出按 FIFO 消耗最早 lot。

### 5.2 A 股 / 场内基金：登记日持有份额

对每条东财分红事件：

1. 取 `exDividendDate`（除权除息日）。
2. 股权登记日 ≈ **除权日前一交易日**（首版简化；P1 可存 API 的 `recordDate`）。
3. 模拟 FIFO：从登记日倒推 00:00 时点的份额快照。
4. 仅当该 symbol **首笔买入时间 < 登记日** 且登记日份额 > 0 时，产生应收分红。

```text
eligible_qty = snapshot_quantity(symbol, record_date)
if eligible_qty <= 0 → 不产生记录
if first_buy_at >= record_date → 不产生记录（建仓晚于登记）
```

场外基金：用 `exDividendDate` 或 `payDate` 前一日份额快照，逻辑相同。

### 5.3 分红记录生成流程

```text
定时/手动 refreshDividends()
  → 对每个持仓 symbol 调用 market.listDividends
  → 过滤 ex_date 落在 [first_buy_at, today] 且 status = implemented
  → 计算 eligible_qty 与 cash_amount
  → upsert portfolio_dividends（dedupe key: symbol + ex_date + plan_id?）
  → 默认 status = estimated，除权日 +3 个交易日自动转 confirmed（可配置）
  → 用户可手工确认/驳回/改金额
```

**幂等键**：`(symbol, ex_dividend_date, dividend_event_id)`，避免重复导入。

### 5.4 与交易回合的关系

- 从**计划确认已入场**可预填一笔 `buy` ledger（可选功能）。
- 从**计划结束并复盘**可预填 `sell` ledger。
- 持仓模块**不替代** `trade_reviews`：复盘仍记录逻辑与教训；持仓记录资本与股息事实。

---

## 6. 分红点亮墙（Life Milestones）

### 6.1 设计意图

把抽象的「累计分红 ¥1,286」转化为可感知的生活物品，强化**现金流回报**感知，而非鼓励消费或加杠杆。

### 6.2 档位表（¥1 — ¥100,000）

共 **15 档**，价格取常见城市大致物价（可配置 JSON，纳入 Git）：

| 档位 | 阈值 (¥) | 图标 | 名称 | 文案示例 |
|------|---------|------|------|----------|
| 1 | 1 | 🥚 | 一颗鸡蛋 | 今天的分红，够买一颗鸡蛋 |
| 2 | 5 | 🧈 | 一块豆腐 | 够买一块嫩豆腐 |
| 3 | 10 | 🥬 | 一把青菜 | 够买一把时令青菜 |
| 4 | 20 | 🍱 | 一顿简餐 | 够一份工地盒饭 |
| 5 | 50 | 🛢 | 一桶油 | 够买一小桶食用油 |
| 6 | 100 | 🍚 | 一袋大米 | 够买 5kg 大米 |
| 7 | 200 | 🥛 | 一箱奶 | 够买一箱纯牛奶 |
| 8 | 500 | 🛏 | 一床被褥 | 够买一床夏被 |
| 9 | 1,000 | 🍲 | 一口锅 | 够买一口不粘锅 |
| 10 | 2,000 | 📱 | 一部入门机 | 够买一部备用手机 |
| 11 | 5,000 | ❄️ | 一台空调 | 够买一台入门空调 |
| 12 | 10,000 | 🧳 | 短途旅行 | 够一次周边双人游 |
| 13 | 20,000 | 🛵 | 一辆电动车 | 够买一辆代步电动车 |
| 14 | 50,000 | 🏠 | 家电套装 | 够配齐基础家电 |
| 15 | 100,000 | 🏡 | 装修基金 | 够覆盖一项硬装支出 |

配置文件：`src/shared/portfolio/dividend-milestones.ts`

### 6.3 点亮规则

```typescript
function computeMilestoneState(ytdReceived: number, milestones: Milestone[]) {
  return milestones.map((m) => ({
    ...m,
    lit: ytdReceived >= m.threshold,
    progress: clamp(ytdReceived / m.threshold, 0, 1), // 当前档未满时显示进度环
  }));
}
```

- **已点亮**：饱和度 100%，轻微 glow，可 hover 看首次点亮日期（该档阈值首次被跨越的日期，由 dividend 明细反推）。
- **当前进行中**：最近一个未点亮档显示环形进度 `ytd / threshold`。
- **未解锁**：灰度 + 虚线轮廓，**不显示**「差 XX 元」在主界面（避免交易冲动）；详情抽屉可选显示。

### 6.4 视觉规范

- 横向滚动卡片墙，移动端 2 行网格。
- 点亮动画：首次跨越阈值时 600ms scale + 粒子（仅当年首次，localStorage 记 `milestone_seen_{year}_{id}`）。
- 与 [UI_THEME.md](UI_THEME.md) 一致：主色钴蓝几何底，点亮态用 **signal-lime** 点缀，不用金币雨/老虎机等博彩视觉。

---

## 7. 分红日历

### 7.1 视图

- **月历**（主）：Ant Design Calendar 或自研月格。
- **列表**（辅）：按 ex_date 排序的时间线。

### 7.2 日历单元格数据

每个有事件的日期聚合：

| 类型 | 来源 | 展示 |
|------|------|------|
| 已实施 | `portfolio_dividends` confirmed | 绿色点 · 实收 ¥XX |
| 待除权 | API announced | 蓝色点 · 预期 ¥XX |
| 已估算 | 历史 fallback | 灰色点 · 估算 ¥XX |

点击日期 → 侧栏列出：

- 标的名称、除权日、登记日、每股派息、持有份额、预计/实收金额、状态。

### 7.3 筛选

- 按标的 / 类型（股票|ETF|基金）/ 状态筛选。
- 「仅看我的持仓相关事件」默认开启。

---

## 8. 数据模型（SQLite）

### 8.1 迁移 v3：`portfolio`

```sql
-- 账户（首版可只有 default）
CREATE TABLE portfolio_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CNY',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

-- 份额流水
CREATE TABLE portfolio_ledger (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('stock','etf','lof','otc_fund')),
  side TEXT NOT NULL CHECK (side IN ('buy','sell','dividend_reinvest')),
  quantity_micros INTEGER NOT NULL,          -- 1e4 精度，卖出为负
  price_micros INTEGER NOT NULL CHECK (price_micros > 0),
  fees_cents INTEGER NOT NULL DEFAULT 0,
  trade_at TEXT NOT NULL,
  plan_id TEXT,
  note TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES portfolio_accounts(id),
  FOREIGN KEY (plan_id) REFERENCES trading_plans(id) ON DELETE SET NULL
) STRICT;

CREATE INDEX portfolio_ledger_symbol_idx ON portfolio_ledger(account_id, symbol, trade_at);

-- 分红记录（已发生 + 待确认）
CREATE TABLE portfolio_dividends (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  kind TEXT NOT NULL,
  ex_dividend_date TEXT NOT NULL,            -- YYYY-MM-DD
  record_date TEXT,                          -- 可选，API 有则存
  pay_date TEXT,
  cash_per_share_micros INTEGER NOT NULL,    -- 每股派息 1e4
  eligible_quantity_micros INTEGER NOT NULL,
  cash_amount_cents INTEGER NOT NULL,        -- 税前合计 分
  status TEXT NOT NULL CHECK (status IN ('estimated','confirmed','rejected')),
  source TEXT NOT NULL CHECK (source IN ('api','manual')),
  external_event_key TEXT,                   -- 东财事件 dedupe
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (account_id, symbol, ex_dividend_date, external_event_key)
) STRICT;

CREATE INDEX portfolio_dividends_year_idx ON portfolio_dividends(account_id, ex_dividend_date);
```

### 8.2 不持久化 / 短缓存

| 数据 | 策略 |
|------|------|
| 实时行情 | 请求时拉取，内存缓存 60s |
| 待实施分红公告 | 拉取后内存合并，可选写 `jobs` 每日同步 |
| 点亮状态 | 由 YTD 实时计算，不单独存表 |

---

## 9. 服务层 API

### 9.1 ServiceContract（渲染进程）

```typescript
// 语义化 API — 渲染进程只调这些
'portfolio.listPositions': {
  params: { accountId?: string };
  result: PortfolioPositionView[];
};

'portfolio.getSummary': {
  params: { accountId?: string; year?: number };
  result: PortfolioSummaryView;
};

'portfolio.getDividendCalendar': {
  params: { accountId?: string; month: string }; // YYYY-MM
  result: DividendCalendarDay[];
};

'portfolio.listDividends': {
  params: { accountId?: string; year?: number; status?: DividendRecordStatus[] };
  result: PortfolioDividendRecord[];
};

'portfolio.addLedgerEntry': {
  params: CreatePortfolioLedgerInput;
  result: PortfolioPositionView;
};

'portfolio.confirmDividend': {
  params: { id: string; confirmed: boolean; cashAmountCents?: number };
  result: PortfolioDividendRecord;
};

'portfolio.refreshDividends': {
  params: { accountId?: string; symbol?: string };
  result: { synced: number; estimated: number };
};

'portfolio.syncMarketQuotes': {
  params: { accountId?: string };
  result: PortfolioPositionView[];
};
```

preload 暴露：

```typescript
window.desktop.portfolio = {
  listPositions,
  getSummary,
  getDividendCalendar,
  listDividends,
  addLedgerEntry,
  confirmDividend,
  refreshDividends,
  syncMarketQuotes,
};
```

### 9.2 内部模块

```text
src/service/portfolio/
  ├── portfolio-service.ts       # 编排入口
  ├── ledger-service.ts          # FIFO 流水与份额快照
  ├── dividend-matcher.ts        # API 事件 ↔ 持有份额匹配
  ├── dividend-stats.ts          # YTD / expected / daily avg / milestones
  └── portfolio-repository.ts    # SQLite CRUD
```

`dividend-stats.ts` 纯函数，便于单测：

```typescript
export function computeYtdReceived(records: PortfolioDividendRecord[], year: number): number;
export function computeExpected(holdings: PositionSnapshot[], events: DividendEvent[]): number;
export function computeMilestones(ytd: number): MilestoneState[];
```

### 9.3 与 MarketService 的调用

| 场景 | 调用 |
|------|------|
| 录入标的校验 | `market.resolve(symbol)` |
| 列表刷新现价 | `market.getQuotes(symbols[])` |
| 同步历史分红 | `market.listDividends(symbol, page, pageSize)` |
| 预期分红 | `listUpcomingDividends` + 持仓数量 |
| 类型标签 | `InstrumentInfo.kind` |

---

## 10. 类型契约（shared）

```typescript
// src/shared/portfolio/types.ts

export interface PortfolioPositionView {
  symbol: string;
  name: string;
  kind: InstrumentKind;
  quantity: number;
  avgCost: number;
  marketPrice: number | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
  firstBuyAt: string;
  ytdDividendReceived: number;
  expectedDividend: number;
  dividendYieldTtm: number | null;
}

export interface PortfolioSummaryView {
  year: number;
  ytdReceived: number;
  expectedDividend: number;
  dailyAverage: number;
  totalMarketValue: number;
  totalCost: number;
  milestones: MilestoneState[];
  lastRefreshedAt: string | null;
}

export interface PortfolioDividendRecord {
  id: string;
  symbol: string;
  name: string;
  exDividendDate: string;
  cashPerShare: number;
  eligibleQuantity: number;
  cashAmount: number;
  status: 'estimated' | 'confirmed' | 'rejected';
  source: 'api' | 'manual';
}

export interface DividendCalendarDay {
  date: string; // YYYY-MM-DD
  items: Array<{
    symbol: string;
    name: string;
    kind: InstrumentKind;
    cashAmount: number;
    status: 'confirmed' | 'expected' | 'projected';
  }>;
}
```

---

## 11. UI 细节补充

### 11.1 持仓列表 Tab

| 列 | 说明 |
|----|------|
| 标的 | 名称 + 代码 + kind 标签（股票/ETF/LOF/场外） |
| 份额 | 当前数量，ETF/LOF 整数，场外支持 2 位小数 |
| 成本/现价 | 双行小字 |
| 市值 | 来自 API |
| 今年分红 | 该 symbol YTD 合计 |
| 预期分红 | 待除权公告合计 |
| 股息率 | f133 或估算值 |
| 操作 | 加仓/减仓/查看分红明细 |

### 11.2 录入持仓 Modal

- 代码输入 → blur 时 `market.resolve` 自动识别类型与名称。
- 必填：账户、代码、买入日期、数量、成交价、手续费。
- 可选：关联计划、备注。
- 场外基金：价格填确认净值；份额可小数。

### 11.3 分红明细 Tab

表格 + 状态筛选（已确认 / 待确认 / 已驳回），支持：

- 手工新增一条分红（补录券商延迟到账）。
- 批量确认 API 估算记录。
- 导出 CSV（年度股息汇总，P1）。

### 11.4 空状态

- 无持仓：引导「录入第一笔持仓」或「从激活中的计划导入」。
- 有持仓无分红：展示「今年尚未收到分红」+ 最近待除权预告（若有）。

---

## 12. 边界与合规

1. **免责声明**（页脚固定）：「股息来自公开数据与用户录入，可能与券商对账单不一致；不构成投资建议。」
2. **点亮墙**：仅展示已实现的累计分红，不用预期分红点亮。
3. **AI**：本模块首版不调用 LLM；后续若做「分红摘要」须走 `LlmRunner` + safety prompt，且禁止荐股。
4. **精度**：金额展示 2 位小数；内部用整数分/微单位，与现有 `trade_reviews` 一致。

---

## 13. 测试策略

```text
tests/portfolio/
  ├── ledger-fifo.test.ts         # 买卖后份额、登记日快照
  ├── dividend-matcher.test.ts    # 建仓前后除权、部分卖出
  ├── dividend-stats.test.ts      # YTD / expected / daily avg / milestones
  └── portfolio-service.test.ts   # SQLite 集成（内存库）
```

**关键用例**：

| 用例 | 期望 |
|------|------|
| 除权日前一天买入 | 该次除权不计入 |
| 除权日前卖出全部 | eligible_qty = 0 |
| 分两笔买入，登记日介于两笔之间 | 只计第一笔份额 |
| 同 symbol 两次除权 | 两条 dividend 记录 |
| YTD 从 99 涨到 100 | 点亮「一袋大米」档 |

Market API 在单元测试中 mock，CI 不依赖东财网络。

---

## 14. 实施分期

### Phase 0 — 数据基础（约 3 天）

- [ ] SQLite v3 迁移 + repository
- [ ] ledger FIFO + 份额快照
- [ ] `portfolio.addLedgerEntry` / `listPositions`
- [ ] 录入 Modal + 持仓列表页骨架

### Phase 1 — 股息统计（约 3 天）

- [ ] `dividend-matcher` + `refreshDividends`
- [ ] `getSummary`（YTD / expected / daily avg）
- [ ] `dividend-milestones.ts` + 点亮墙 UI
- [ ] 分红明细 Tab + 确认/驳回

### Phase 2 — 日历与 polish（约 2 天）

- [ ] `getDividendCalendar` + 月历视图
- [ ] 首页摘要卡片
- [ ] 计划入场/结束联动预填 ledger（可选）
- [ ] 除权日前提醒 hook 到 `alerts`（可选 P1）

### Phase 3 — 导入与对账（P1）

- [ ] CSV 导入持仓流水
- [ ] 与券商对账单 diff 视图
- [ ] 分红再投资 `dividend_reinvest` 支持

---

## 15. 开发检查清单

- [ ] 新增 `src/shared/portfolio/` 类型与 milestones 配置
- [ ] `ServiceContract` + IPC + preload 注册
- [ ] 渲染进程不直连东财
- [ ] 累计分红口径文档与 UI 文案一致（「持仓后收到」）
- [ ] 点亮墙不用预期分红
- [ ] 单元测试覆盖 FIFO 与登记日逻辑
- [ ] 更新 [PRODUCT_FUNCTIONAL_DESIGN.md](PRODUCT_FUNCTIONAL_DESIGN.md) 信息架构表

---

## 16. 附录：示例演算

**持仓**：2026-03-10 买入 `600941` 中国移动 200 股；2026-06-01 分红每股 2.0 元（除权日 2026-06-05）。

- 登记日快照：200 股 → 应收 **¥400**（税前）
- 2026-08-01 卖出 100 股；2026-09-15 除权每股 2.1 元
- 登记日快照：100 股 → 应收 **¥210**
- **2026 YTD 累计**（均已确认）：**¥610**
- **日均**（假设今天 2026-08-26，237 天）：610 / 237 ≈ **¥2.57/天**
- **点亮**：🥚🧈🥬🍱🛢🍚🥛 全亮，🛏（500 档）进度 610/500 已亮

---

*文档版本随实施更新；首版以 A 股与场内基金为主，场外基金净值日期规则在 Phase 1 联调时补充细则。*
