import { z } from 'zod';

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .refine((value) => {
    const parsed = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
  }, '请输入有效日期');
export const stockStrategySymbolSchema = z.string().regex(/^(?:00[0-3]|30[01]|60[0135]|688)\d{3}$/u, '仅支持沪深 A 股股票代码');
export const stockStrategySettingsSchema = z
  .object({
    strategyId: z.enum(['momentum', 'breakout', 'pullback']),
    poolId: z.enum(['personal', 'research', 'custom']),
    symbols: z.array(stockStrategySymbolSchema).max(60),
    selectionSource: z
      .object({
        platform: z.enum(['wencai', 'eastmoney']),
        query: z.string().trim().min(2).max(2000),
        queriedAt: z.iso.datetime(),
        snapshotId: z.uuid(),
      })
      .strict()
      .optional(),
    topN: z.number().int().min(1).max(20),
    holdingDays: z.number().int().min(1).max(60),
    stopLossPercent: z.number().finite().min(1).max(50),
    takeProfitPercent: z.number().finite().min(1).max(200),
    initialCapital: z.number().finite().min(10_000).max(100_000_000),
    commissionBps: z.number().finite().min(0).max(100),
    minimumCommission: z.number().finite().min(0).max(100),
    stampDutyBps: z.number().finite().min(0).max(100),
    slippageBps: z.number().finite().min(0).max(100),
  })
  .strict()
  .refine((input) => input.poolId !== 'custom' || input.symbols.length > 0, '自定义股票池不能为空')
  .refine((input) => !input.selectionSource || input.poolId === 'custom', '平台选股来源只适用于导入的自定义股票池');
export const stockStrategyBacktestSchema = z
  .object({
    settings: stockStrategySettingsSchema,
    startDate: date,
    endDate: date,
  })
  .strict()
  .superRefine((input, ctx) => {
    const days = (Date.parse(input.endDate) - Date.parse(input.startDate)) / 86_400_000;
    if (days < 1 || days > 730) ctx.addIssue({ code: 'custom', message: '回测区间须为 2 天至 2 年', path: ['endDate'] });
    if (input.startDate < '2023-08-28')
      ctx.addIssue({ code: 'custom', message: '首版支持 2023-08-28 起的日线回测', path: ['startDate'] });
  });
export const stockStrategyServiceRequests = [
  z.object({ id: z.uuid(), method: z.literal('stockStrategy.state'), params: z.object({}).strict() }),
  z.object({ id: z.uuid(), method: z.literal('stockStrategy.save'), params: stockStrategySettingsSchema }),
  z.object({
    id: z.uuid(),
    method: z.literal('stockStrategy.screen'),
    params: z.object({ settings: stockStrategySettingsSchema, refresh: z.boolean().optional() }).strict(),
  }),
  z.object({ id: z.uuid(), method: z.literal('stockStrategy.backtest'), params: stockStrategyBacktestSchema }),
] as const;
