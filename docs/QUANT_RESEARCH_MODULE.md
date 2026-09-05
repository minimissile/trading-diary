# 独立量化研究模块

入口：侧栏「量化研究」，路由 `/quant-research`。

首版接入 Rockyzsu/stock 中技术筛选和 K 线形态研究的功能思路：区间新高／新低、均线上下穿、成交量异动、阳包阴、阴包阳、长上影。用户选择规则及股票池后手动扫描，按标的或规则筛选结果，并可查看最近 20 次扫描快照。没有命中和数据不可用分别展示。

## 模块边界

- `src/renderer/features/quant-research/`：独立页面、列表、样式，路由按需加载。
- `src/shared/quant-research/`：规则目录、输入与输出契约、校验。
- `src/service/quant-research/`：独立行情适配器、计算引擎、服务及持久化。
- `quantResearch.*`：专用 preload、IPC、Utility Process 方法。
- `quant_research_settings`、`quant_research_runs`：专属 SQLite 表，复用应用数据库连接与备份机制；不读写已有策略配置、持仓或成交。
- 自选股票池只读现有自选列表；自定义股票池由本模块独立保存。

## 数据与计算

使用腾讯前复权日线，严格要求返回前复权数据，不以未复权数据补位。最多 60 只沪深 A 股，6 并发，每只请求超时 12 秒。请求完成后才原子保存配置与结果，保留最近 20 次成功扫描。重复的并发请求合并，不同配置的并发扫描拒绝执行。

北京时间 15:30 前截止到前一天；实际最近 1–20 个交易日由沪深 300 日线决定。窗口有缺失或停牌、预热历史不足、当前名称包含 ST / 退的标的被排除并给出原因。全部失败不会保存为「零信号」。所有计算只使用信号日期及以前的数据；区间高低和均量不含当日。

形态采用规则说明页的显式定义，是独立 TypeScript 实现，不是 TA-Lib 兼容实现。历史快照保留当时的股票名单、参数、前复权参考价、排除原因和引擎版本。固定股票池与当前证券名称不能还原历史成分，前复权数据也可能修订；本模块输出历史特征，不计算交易收益。

## 来源与后续扩展

参考仓库：https://github.com/Rockyzsu/stock

参考模块：`analysis/get_break_high_low.py`、`select_stock.py`、`k-line/recognize_form.py`、`k-line/search_target.py`。未引入原 Python 运行时、TA-Lib、MySQL 或 MongoDB。

基金份额异动、公告事件、全市场涨停数据不在本次首版中。后续可在本模块增加独立 provider、结果类型和页面标签；已有策略选股、回测、龙虎榜及 LOF 业务保持各自入口。

## 验证

`npx vitest run tests/quant-research.test.ts` 覆盖信号边界、无未来数据、交易日窗口、数据失败、并发、持久化、迁移和备份恢复。测试只创建临时数据库，不连接用户交易数据库。
