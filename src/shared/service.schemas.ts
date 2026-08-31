import { z } from 'zod';
import { ACCOUNT_BROKER_IDS } from './accounts/brokers';

export const assetHashSchema = z.string().regex(/^[a-f0-9]{64}$/u);

const positiveNumberSchema = z.coerce.number().finite().positive();
const nonNegativeNumberSchema = z.coerce.number().finite().nonnegative();
const symbolSchema = z.string().trim().min(1).max(32);
const accountBrokerSchema = z.enum(ACCOUNT_BROKER_IDS);
const accountKindSchema = z.enum(['securities', 'fund']);

/** 账户自定义费率（含沪/深 ETF 分市场佣金）。 */
export const accountCustomFeeSchema = z
  .object({
    commissionWan: nonNegativeNumberSchema,
    commissionMinYuan: nonNegativeNumberSchema.optional(),
    noCommissionMin: z.boolean().optional(),
    etfCommissionWan: nonNegativeNumberSchema.optional(),
    etfCommissionMinYuan: nonNegativeNumberSchema.optional(),
    etfNoCommissionMin: z.boolean().optional(),
    etfShCommissionWan: nonNegativeNumberSchema.optional(),
    etfShCommissionMinYuan: nonNegativeNumberSchema.optional(),
    etfShNoCommissionMin: z.boolean().optional(),
    etfSzCommissionWan: nonNegativeNumberSchema.optional(),
    etfSzCommissionMinYuan: nonNegativeNumberSchema.optional(),
    etfSzNoCommissionMin: z.boolean().optional(),
    hkCommissionWan: nonNegativeNumberSchema.optional(),
    hkCommissionMinYuan: nonNegativeNumberSchema.optional(),
    hkNoCommissionMin: z.boolean().optional(),
    usCommissionWan: nonNegativeNumberSchema.optional(),
    usCommissionMinYuan: nonNegativeNumberSchema.optional(),
    usNoCommissionMin: z.boolean().optional(),
    usCommissionPerShare: nonNegativeNumberSchema.optional(),
  })
  .strict();
const accountAliasSchema = z.string().trim().max(80);

const createAccountParamsSchema = z
  .object({
    alias: accountAliasSchema.optional(),
    name: accountAliasSchema.optional(),
    broker: accountBrokerSchema.optional(),
    accountKind: accountKindSchema.optional(),
    currency: z.string().trim().min(3).max(8).optional(),
    marketScope: z.array(z.string().trim().min(1).max(32)).optional(),
    feeProfileId: z.string().trim().min(1).max(64).optional(),
    customFee: accountCustomFeeSchema.optional(),
    isDefault: z.boolean().optional(),
  })
  .strict();

const updateAccountInputSchema = z
  .object({
    alias: accountAliasSchema.optional(),
    name: accountAliasSchema.optional(),
    broker: accountBrokerSchema.optional(),
    accountKind: accountKindSchema.optional(),
    feeProfileId: z.string().trim().min(1).max(64).optional(),
    customFee: accountCustomFeeSchema.optional(),
  })
  .strict();
const planStatusSchema = z.enum(['draft', 'watching', 'holding', 'completed', 'cancelled']);
const alertStatusSchema = z.enum(['active', 'triggered', 'completed', 'disabled']);
const directionSchema = z.enum(['long', 'short']);

const createPlanParamsSchema = z
  .object({
    symbol: symbolSchema,
    name: z.string().trim().min(1).max(80),
    direction: directionSchema,
    thesis: z.string().trim().min(1).max(1_000),
    entryPrice: positiveNumberSchema,
    stopPrice: positiveNumberSchema,
    targetPrice: positiveNumberSchema.nullable(),
    riskAmount: nonNegativeNumberSchema,
    activateNow: z.boolean(),
  })
  .strict();

const createAlertParamsSchema = z
  .object({
    symbol: symbolSchema,
    title: z.string().trim().min(1).max(120),
    condition: z.enum(['at_or_above', 'at_or_below']),
    targetPrice: positiveNumberSchema,
  })
  .strict();

const reviewAiDraftParamsSchema = z
  .object({
    planId: z.uuid().nullable(),
    symbol: symbolSchema,
    title: z.string().trim().min(1).max(120),
    direction: directionSchema,
    planned: z.boolean(),
    entryPrice: positiveNumberSchema,
    exitPrice: positiveNumberSchema,
    quantity: positiveNumberSchema,
    fees: nonNegativeNumberSchema,
    executionScore: z.number().int().min(1).max(5),
    partialSummary: z.string().trim().max(2_000).optional(),
    partialLesson: z.string().trim().max(2_000).optional(),
  })
  .strict();

const executionColumnMappingSchema = z
  .object({
    symbol: z.number().int().min(-1),
    side: z.number().int().min(-1),
    quantity: z.number().int().min(-1),
    price: z.number().int().min(-1),
    fees: z.number().int().min(-1),
    tradeAt: z.number().int().min(-1),
  })
  .strict();

const executionImportInputSchema = z
  .object({
    sourcePath: z.string().min(1),
    accountId: z.string().trim().min(1).optional(),
    mapping: executionColumnMappingSchema,
  })
  .strict();

const createReviewParamsSchema = z
  .object({
    planId: z.uuid().nullable(),
    episodeId: z.uuid().nullable().optional(),
    symbol: symbolSchema,
    title: z.string().trim().min(1).max(120),
    direction: directionSchema,
    planned: z.boolean(),
    entryPrice: positiveNumberSchema,
    exitPrice: positiveNumberSchema,
    quantity: positiveNumberSchema,
    fees: nonNegativeNumberSchema,
    executionScore: z.number().int().min(1).max(5),
    summary: z.string().trim().min(1).max(2_000),
    lesson: z.string().trim().min(1).max(2_000),
    saveToPlaybook: z.boolean().optional(),
  })
  .strict();

const playbookCategorySchema = z.enum(['entry', 'position', 'stop', 'exit', 'market', 'emotion', 'process']);
const playbookStatusSchema = z.enum(['active', 'archived']);
const playbookCheckTimingSchema = z.enum(['plan_activation', 'always']);
const alertEventActionSchema = z.enum(['acknowledged', 'snoozed', 'dismissed', 'completed']);

const createPlaybookRuleParamsSchema = z
  .object({
    content: z.string().trim().min(1).max(2_000),
    category: playbookCategorySchema,
    symbol: symbolSchema.nullable().optional(),
    checkTiming: playbookCheckTimingSchema.optional(),
    sourceReviewId: z.uuid().nullable().optional(),
  })
  .strict();

const updatePlaybookRuleParamsSchema = z
  .object({
    content: z.string().trim().min(1).max(2_000).optional(),
    category: playbookCategorySchema.optional(),
    symbol: symbolSchema.nullable().optional(),
    checkTiming: playbookCheckTimingSchema.optional(),
    status: playbookStatusSchema.optional(),
  })
  .strict();

export { serviceRequestSchema } from './schemas/service-request';
