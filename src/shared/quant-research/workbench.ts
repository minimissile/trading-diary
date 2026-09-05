import { z } from 'zod';
import { quantCompletedDate } from './catalog';

export const researchKindSchema = z.enum([
  'prices',
  'backtest',
  'lof',
  'shares',
  'announcements',
  'market',
  'fundamentals',
  'bonds',
  'prediction',
]);
export type ResearchKind = z.infer<typeof researchKindSchema>;
const code = z.string().regex(/^\d{6}$/, '请输入六位证券代码');
const stock = z.string().regex(/^(?:00[0-3]|30[01]|60[0135]|688)\d{3}$/, '仅支持沪深 A 股');
const date = z.iso.date();
const symbols = z
  .array(code)
  .max(30, '最多 30 个代码')
  .refine((v) => new Set(v).size === v.length, '代码不能重复');
const rate = z.number().min(0).max(100);
export const researchRequestSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('prices'), symbol: stock, endDate: date, days: z.number().int().min(1).max(600) }).strict(),
    z
      .object({
        kind: z.literal('backtest'),
        symbol: stock,
        endDate: date,
        days: z.number().int().min(20).max(400),
        strategy: z.enum(['ma', 'breakout']),
        period: z.number().int().min(2).max(120),
        capital: z.number().min(1000).max(1e8),
        commissionBps: rate,
        sellTaxBps: rate,
        slippageBps: rate,
        minCommission: z.number().min(0).max(100),
      })
      .strict(),
    z
      .object({
        kind: z.literal('lof'),
        symbols,
        threshold: z.number().min(0).max(100),
        feePct: z.number().min(0).max(10),
        refreshMinutes: z.number().int().min(0).max(60),
      })
      .strict(),
    z
      .object({ kind: z.literal('shares'), fundType: z.enum(['etf', 'lof']), symbols, threshold: z.number().min(0).max(100) })
      .strict(),
    z
      .object({ kind: z.literal('announcements'), symbols, startDate: date, endDate: date, keyword: z.string().trim().max(60) })
      .strict(),
    z.object({ kind: z.literal('market'), date }).strict(),
    z
      .object({
        kind: z.literal('fundamentals'),
        reportDate: date,
        minRoe: z.number().min(-1000).max(1000),
        minGrowth: z.number().min(-1000).max(10000),
        excludeLoss: z.boolean(),
        symbols,
      })
      .strict(),
    z
      .object({ kind: z.literal('bonds'), maxPrice: z.number().min(1).max(10000), maxPremium: z.number().min(-100).max(1000) })
      .strict(),
    z
      .object({
        kind: z.literal('prediction'),
        symbol: stock,
        endDate: date,
        trainingDays: z.number().int().min(60).max(240),
        testDays: z.number().int().min(20).max(120),
      })
      .strict(),
  ])
  .superRefine((input, ctx) => {
    if (
      input.kind === 'announcements' &&
      (input.startDate > input.endDate || Date.parse(input.endDate) - Date.parse(input.startDate) > 90 * 864e5)
    )
      ctx.addIssue({ code: 'custom', message: '公告日期须按先后排列且跨度不超过 90 天' });
    if (input.kind === 'fundamentals' && !/-(03-31|06-30|09-30|12-31)$/.test(input.reportDate))
      ctx.addIssue({ code: 'custom', message: '请选择季度末报告期（03-31 / 06-30 / 09-30 / 12-31）' });
  });
export type ResearchRequest = z.infer<typeof researchRequestSchema>;
export type ResearchInput<K extends ResearchKind> = Extract<ResearchRequest, { kind: K }>;
const value = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const researchReportSchema = z.object({
  id: z.uuid(),
  kind: researchKindSchema,
  createdAt: z.iso.datetime(),
  asOf: z.string(),
  request: researchRequestSchema,
  title: z.string(),
  source: z.string(),
  notes: z.array(z.string()),
  warnings: z.array(z.string()),
  metrics: z.array(z.object({ label: z.string(), value: z.string() })),
  columns: z.array(
    z.object({ key: z.string(), label: z.string(), format: z.enum(['text', 'number', 'percent', 'money', 'link']).optional() }),
  ),
  rows: z.array(z.record(z.string(), value)),
  curve: z.array(z.object({ date: z.string(), equity: z.number(), benchmark: z.number() })).optional(),
});
export type ResearchReport = z.infer<typeof researchReportSchema>;
export type ResearchRow = ResearchReport['rows'][number];
export type ResearchColumn = ResearchReport['columns'][number];
export type ResearchSummary = Pick<ResearchReport, 'id' | 'kind' | 'createdAt' | 'title' | 'asOf'>;
export interface ResearchState {
  settings: ResearchRequest;
  latest: ResearchReport | null;
  history: ResearchSummary[];
}

export const RESEARCH_TOOLS: Array<{ kind: ResearchKind; name: string; description: string }> = [
  { kind: 'prices', name: '行情采集', description: '读取独立的前复权日线快照，查看价量数据并导出。' },
  { kind: 'backtest', name: '基础回测', description: '独立的均线 / 突破策略，比较资金曲线、回撤与模拟成交。' },
  { kind: 'lof', name: 'LOF 折溢价', description: '对照最新场内价格与已公布净值，观察偏离及申赎状态。' },
  { kind: 'shares', name: '基金份额', description: '保存 ETF / LOF 场内份额快照，比较不同数据日期的变化。' },
  { kind: 'announcements', name: '公告事件', description: '检索上市公司公告，标记持股变动、业绩与风险事件。' },
  { kind: 'market', name: '市场情绪', description: '观察涨停、跌停、炸板、连板及行业分布。' },
  { kind: 'fundamentals', name: '财务筛选', description: '按报告期筛选 ROE、利润增长与盈利情况，保留风险标记。' },
  { kind: 'bonds', name: '可转债', description: '比较价格、转股溢价、双低值、信用评级及赎回信息。' },
  { kind: 'prediction', name: '概率实验', description: '用朴素贝叶斯滚动检验次日方向，与始终看涨基线比较。' },
];
export function defaultResearchRequest(kind: ResearchKind, now = new Date()): ResearchRequest {
  const endDate = quantCompletedDate(now);
  switch (kind) {
    case 'prices':
      return { kind, symbol: '600036', endDate, days: 240 };
    case 'backtest':
      return {
        kind,
        symbol: '600036',
        endDate,
        days: 240,
        strategy: 'ma',
        period: 20,
        capital: 100000,
        commissionBps: 3,
        sellTaxBps: 5,
        slippageBps: 5,
        minCommission: 5,
      };
    case 'lof':
      return { kind, symbols: [], threshold: 2, feePct: 0, refreshMinutes: 0 };
    case 'shares':
      return { kind, fundType: 'etf', symbols: [], threshold: 1 };
    case 'announcements':
      return {
        kind,
        symbols: [],
        startDate: new Date(Date.parse(endDate) - 7 * 864e5).toISOString().slice(0, 10),
        endDate,
        keyword: '',
      };
    case 'market':
      return { kind, date: endDate };
    case 'fundamentals': {
      const year = Number(endDate.slice(0, 4));
      const month = Number(endDate.slice(5, 7));
      return {
        kind,
        reportDate: month >= 9 ? `${year}-06-30` : month >= 5 ? `${year}-03-31` : `${year - 1}-12-31`,
        minRoe: 0,
        minGrowth: 0,
        excludeLoss: true,
        symbols: [],
      };
    }
    case 'bonds':
      return { kind, maxPrice: 140, maxPremium: 40 };
    case 'prediction':
      return { kind, symbol: '600036', endDate, trainingDays: 120, testDays: 60 };
  }
}
