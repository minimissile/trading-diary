import { z } from 'zod';
import { LHB_NUMERIC_FILTERS, lhbRangeKeys, type LhbRangeKey } from '../../longhubang/filters';

export const lhbDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .refine((value) => {
    const timestamp = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
  }, '请输入有效日期');
const symbol = z
  .string()
  .trim()
  .regex(/^\d{6}$/u, '股票代码应为六位数字');
const cents = z.number().int().safe();
const percent = z.number().finite();

const numericRanges = Object.fromEntries(
  LHB_NUMERIC_FILTERS.flatMap((field) => {
    let schema = z.number().finite();
    if (field.field.endsWith('Cents')) schema = schema.int().safe();
    if (field.field.endsWith('Count')) schema = schema.int();
    if ('nonnegative' in field && field.nonnegative) schema = schema.nonnegative();
    return lhbRangeKeys(field.field).map((key) => [key, schema.optional()]);
  }),
) as Record<LhbRangeKey, z.ZodOptional<z.ZodNumber>>;

export const lhbQuerySchema = z
  .object({
    ...numericRanges,
    securityType: z.enum(['stock', 'bond', 'all']).optional(),
    board: z.string().trim().max(40).optional(),
    reasonCode: z.string().trim().max(40).optional(),
    interpretation: z.string().trim().max(100).optional(),
    hasInstitution: z.boolean().optional(),
    includeInstitution: z.boolean().optional(),
    view: z.enum(['events', 'stocks']).optional(),
    countMode: z.enum(['days', 'events']).optional(),
    minAppearances: z.number().int().min(1).max(50000).optional(),
    maxAppearances: z.number().int().min(1).max(50000).optional(),
    startDate: lhbDateSchema,
    endDate: lhbDateSchema,
    symbol: symbol.optional(),
    keyword: z.string().trim().max(40).optional(),
    exchange: z.enum(['SH', 'SZ', 'BJ', 'UNKNOWN']).optional(),
    period: z.enum(['daily', 'multi', 'other']).optional(),
    reason: z.string().trim().max(100).optional(),
    minNetCents: cents.optional(),
    maxNetCents: cents.optional(),
    minChangePercent: percent.optional(),
    maxChangePercent: percent.optional(),
    minTurnoverPercent: percent.nonnegative().optional(),
    maxTurnoverPercent: percent.nonnegative().optional(),
    minMarketCapCents: cents.nonnegative().optional(),
    maxMarketCapCents: cents.nonnegative().optional(),
    sort: z
      .enum([
        'date',
        'net',
        'buy',
        'sell',
        'change',
        'turnover',
        'appearances',
        'intervalNet',
        ...LHB_NUMERIC_FILTERS.map((field) => field.field),
      ])
      .optional(),
    order: z.enum(['asc', 'desc']).optional(),
    page: z.number().int().min(1).max(10000).optional(),
    pageSize: z.number().int().min(1).max(100).optional(),
    refresh: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.startDate > value.endDate)
      context.addIssue({ code: 'custom', message: '开始日期不能晚于结束日期', path: ['endDate'] });
    if (!value.symbol && Date.parse(value.endDate) - Date.parse(value.startDate) > 91 * 86_400_000) {
      context.addIssue({
        code: 'custom',
        message: '全市场单次最多查询 92 天（支持完整季度）；跨年历史请指定六位股票代码',
        path: ['endDate'],
      });
    }
    const ranges = [
      ...LHB_NUMERIC_FILTERS.map((field) => lhbRangeKeys(field.field)),
      ['minAppearances', 'maxAppearances'] as const,
    ];
    for (const [min, max] of ranges) {
      if (value[min] !== undefined && value[max] !== undefined && value[min] > value[max]) {
        context.addIssue({ code: 'custom', message: '下限不能大于上限', path: [max] });
      }
    }
  });

export const lhbDetailSchema = z.object({ symbol, date: lhbDateSchema, refresh: z.boolean().optional() }).strict();
export const longhubangServiceRequests = [
  z.object({
    id: z.uuid(),
    method: z.literal('longhubang.status'),
    params: z.object({ refresh: z.boolean().optional() }).strict(),
  }),
  z.object({ id: z.uuid(), method: z.literal('longhubang.query'), params: lhbQuerySchema }),
  z.object({ id: z.uuid(), method: z.literal('longhubang.detail'), params: lhbDetailSchema }),
] as const;
