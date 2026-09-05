# 独立量化研究模块

入口：侧栏「量化研究」，路由 `/quant-research`。

参考 [Rockyzsu/stock](https://github.com/Rockyzsu/stock) 的研究功能，以 TypeScript 独立实现。没有嵌入原项目的 Python、TA-Lib、Backtrader、MySQL 或 MongoDB，也不声称与其脚本逐项或数值完全兼容。龙虎榜按需求排除。

## 当前功能

| 研究工具 | 已接入能力 | 口径与范围 |
| --- | --- | --- |
| 技术信号 | 新高／新低、均线上下穿、放量、阳包阴、阴包阳、长上影，共 8 条规则 | 自选或独立股票池，最多 60 只沪深 A 股；显式规则，不是全套 TA-Lib 形态 |
| 行情采集 | 前复权 OHLCV 日线快照、表格、结果导出 | 单只股票最近 1–600 根完整日线，腾讯成交量口径为手 |
| 基础回测 | 均线策略、前高突破策略、资金曲线、买入持有基线、回撤、费用、成交记录 | 独立引擎与配置；20–400 个交易日，使用可分割模拟单位，不模拟实盘撮合 |
| LOF 折溢价 | 沪深 LOF 行情、公布净值、折溢价、阈值、申赎状态、费用参考、页面定时刷新 | 支持独立限定代码；显示行情／净值日期；监控仅在当前工具页面打开时运行 |
| 基金份额 | ETF / LOF 场内份额快照、增减及变化比例、阈值标记 | 首次建立基线，之后比较更早数据日期；不是全基金总份额或净资金流 |
| 公告事件 | 日期／代码检索、标题关键词、事件标签、原文入口 | A 股公司公告；每次最多最新 500 条，截断会明确提示，日期跨度不超过 90 天 |
| 市场情绪 | 涨停／跌停／炸板、炸板率、连板、行业分布及明细 | 东方财富涨停专题口径，排除 ST、科创板等，非全市场完整计数；仅近期数据 |
| 财务筛选 | 季度 ROE、利润同比、盈利筛选、现金流等风险标记 | 指定报告期，覆盖已披露沪深 A 股；当前获取的报表可能事后修订 |
| 可转债 | 价格／转股溢价筛选、转股价值、双低值、评级、到期／赎回信息 | 排除未上市、已到期、已退市及缺失报价；报表未提供报价交易时间 |
| 概率实验 | 五特征 Bernoulli 朴素贝叶斯、滚动训练、样本外方向检验、看涨基线 | 时间序列训练，不打散；模型概率未经校准，不产生实盘交易 |

除技术扫描已有列表筛选外，新增工具统一提供结果搜索、数值排序、分页、参数回看及 JSON 导出（包含资金曲线、成交或数据明细）。每个工具分别保留最近 20 次成功结果。无符合条件的结果与数据源失败区分展示。

## 独立边界

- `src/renderer/features/quant-research/`：独立页面、列表、样式，路由按需加载。
- `src/shared/quant-research/`：规则目录、输入输出类型及 Zod 校验。
- `src/service/quant-research/`：独立行情适配、信号／回测／概率引擎、研究服务、持久化。
- `quantResearch.*`：专用 preload、IPC、Utility Process 方法；处理器验证窗口来源，服务请求验证参数。
- 数据库表均以 `quant_research_` 开头：`settings`、`runs`、`tool_settings`、`reports`、`share_observations`。仅复用应用数据库连接和备份机制，不调用现有策略回测或 LOF 业务服务，不读写其配置、历史、提醒、仓位或订单。
- 技术扫描的「我的自选」只读现有自选列表；所有自定义股票池和工具参数单独保存。
- 数据库迁移 28 / 29 自动建立独立表。配置、报告和份额观测原子保存；失败回滚，不覆盖上次成功结果。份额基线各证券保留最近 90 个数据日期。
- 同工具相同参数并发合并，不同参数并发拒绝；不同工具可独立运行。公开接口单请求超时 12 秒，单次公开数据任务总预算 5 分钟；LOF 净值最多 6 并发。

## 计算约定

日线要求前复权数据，不用未复权数据补位。北京时间 15:30 前不使用当日日线，市场观察通过沪深 300 日线确定所选日期之前的最近交易日。

回测在前一日收盘产生信号、下一日开盘模拟成交。均线策略在收盘高于均线时空仓买入，低于均线时平仓；突破策略在收盘突破此前 N 日最高价时买入，跌破均线时平仓。预热数据不计入收益。零量和一字 K 线跳过成交。佣金、最低佣金、卖出附加费和滑点都是用户输入的固定研究参数，不自动推断历史法定费率。期末持仓按收盘估值，不强制平仓；买入持有基线不扣费。前复权可分割单位不是实盘股数，不模拟整手、交易队列或公司行动现金流。

LOF 折溢价为 `(价格 / 最近公布单位净值 - 1) × 100%`，净值非盘中估值。费用参考仅从绝对偏离中减去，不代表可执行套利收益；申赎状态随净值记录取得，不替代最新基金公告。页面监控需手动启动，离开工具页面停止，失败后停止自动刷新；已发起的一次请求会完成并保存。

份额使用行情 `f38` 字段。同数据日期刷新覆盖当日观测，只与严格更早日期的观测比较，明确展示比较日期。未连续采样时变化跨越多个交易日；原始份额字段自身也可能延迟。

贝叶斯实验使用涨跌、MA5、MA20、相对前 20 日均量及 5 日动量五个二值特征，Laplace 平滑。每次训练仅包含目标日收盘已知标签；最后一条预测尚无真实结果，不计入命中率。方向准确率不等于交易收益。

## 外部接口

- 腾讯：`web.ifzq.gtimg.cn/appstock/app/fqkline/get`，前复权日线及指数日历。
- 东方财富基金行情：`push2delay.eastmoney.com/api/qt/clist/get`。LOF 分类使用 `MK0404–MK0407`，覆盖沪深市场。
- 净值与申赎：`api.fund.eastmoney.com/f10/lsjz`。
- 公告：`np-anotice-stock.eastmoney.com/api/security/ann`。
- 涨跌停池：`push2ex.eastmoney.com/getTopicZTPool`、`getTopicDTPool`、`getTopicZBPool`。
- 财务／可转债：`datacenter-web.eastmoney.com/api/data/v1/get`，报表 `RPT_LICO_FN_CPD` / `RPT_BOND_CB_LIST`。

字段与参数对照 [AkShare LOF 适配器](https://github.com/akfamily/akshare/blob/main/akshare/fund/fund_lof_em.py)、[基金行情](https://github.com/akfamily/akshare/blob/main/akshare/fund/fund_etf_em.py)、[涨跌停池](https://github.com/akfamily/akshare/blob/main/akshare/stock_feature/stock_ztb_em.py)、[公告](https://github.com/akfamily/akshare/blob/main/akshare/stock_fundamental/stock_notice.py)、[财报](https://github.com/akfamily/akshare/blob/main/akshare/stock_feature/stock_yjbb_em.py)及[可转债](https://github.com/akfamily/akshare/blob/main/akshare/bond/bond_zh_cov.py)，并已用实际接口核对。公共接口可能调整；返回无效或不完整数据时保留错误，不伪造结果。

## 保留范围

不迁入券商账户自动下单、无人值守实盘执行、需要登录或付费凭据的数据抓取、全套 TA-Lib / Backtrader 兼容层、历史全市场数据库及历史时点财报库。原项目零散实验按上述可用研究工具重建，不能描述为整个上游仓库已完整移植。

## 验证

定向命令：

```sh
npx vitest run tests/quant-workbench.test.ts tests/quant-research.test.ts tests/database.test.ts tests/backup.test.ts tests/stock-strategy.test.ts
npm run typecheck
```

覆盖信号边界、成交时序及费用、前视数据隔离、未完成概率检验、数据失败、并发、独立历史保留、同日份额基线、原子回滚、从迁移 27 / 28 升级及备份恢复。测试只创建临时数据库，不连接用户交易数据库。
