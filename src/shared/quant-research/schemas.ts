import { z } from 'zod';

export const quantSymbolSchema = z.string().regex(/^(?:00[0-3]|30[01]|60[0135]|688)\d{3}$/u, '仅支持沪深 A 股六位股票代码');
export const quantDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .refine((date) => {
    const value = Date.parse(`${date}T00:00:00Z`);
    return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === date;
  }, '日期无效');
export const quantRuleSchema = z.enum([
  'new_high',
  'new_low',
  'ma_cross_up',
  'ma_cross_down',
  'volume_surge',
  'bullish_engulfing',
  'bearish_engulfing',
  'upper_shadow',
]);
export const quantSettingsSchema = z
  .object({
    poolId: z.enum(['personal', 'custom']),
    symbols: z
      .array(quantSymbolSchema)
      .max(60)
      .refine((items) => new Set(items).size === items.length, '股票代码不能重复'),
    rules: z
      .array(quantRuleSchema)
      .min(1, '至少选择一条规则')
      .max(8)
      .refine((items) => new Set(items).size === items.length, '规则不能重复'),
    lookback: z.number().int().min(5).max(120),
    maPeriod: z.number().int().min(2).max(120),
    volumeMultiple: z.number().finite().min(1).max(10),
    recentDays: z.number().int().min(1).max(20),
  })
  .strict()
  .refine((value) => value.poolId !== 'custom' || value.symbols.length > 0, '请填写自定义股票代码');

const stock = z.object({ symbol: quantSymbolSchema, name: z.string().min(1).max(100) });
export const quantBarSchema = z
  .object({
    date: quantDateSchema,
    open: z.number().finite().positive(),
    high: z.number().finite().positive(),
    low: z.number().finite().positive(),
    close: z.number().finite().positive(),
    volume: z.number().finite().nonnegative(),
  })
  .refine(
    (bar) => bar.high >= Math.max(bar.open, bar.close, bar.low) && bar.low <= Math.min(bar.open, bar.close),
    '日线高低价无效',
  );

export const quantRunSummarySchema = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  startDate: quantDateSchema,
  endDate: quantDateSchema,
  scannedCount: z.number().int().min(0).max(60),
  matchedCount: z.number().int().min(0).max(60),
  signalCount: z.number().int().min(0).max(9600),
  excludedCount: z.number().int().min(0).max(60),
});
export const quantRunSchema = quantRunSummarySchema.extend({
  settings: quantSettingsSchema,
  universe: z.array(stock).min(1).max(60),
  signals: z
    .array(
      stock.extend({
        id: z.string().min(1).max(100),
        date: quantDateSchema,
        ruleId: quantRuleSchema,
        direction: z.enum(['strength', 'weakness', 'activity']),
        adjustedClose: z.number().finite().positive(),
        volumeRatio: z.number().finite().nonnegative().nullable(),
        description: z.string().max(1000),
      }),
    )
    .max(9600),
  exclusions: z.array(stock.extend({ reason: z.string().max(2000) })).max(60),
  source: z.literal('tencent'),
  engineVersion: z.literal(1),
});
