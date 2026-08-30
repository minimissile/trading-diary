import { z } from 'zod';
import {
  accountAliasSchema,
  accountBrokerSchema,
  accountKindSchema,
  directionSchema,
  nonNegativeNumberSchema,
  playbookCategorySchema,
  playbookCheckTimingSchema,
  playbookStatusSchema,
  positiveNumberSchema,
  symbolSchema,
} from './primitives';

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
  })
  .strict();

export const createAccountParamsSchema = z
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

export const updateAccountInputSchema = z
  .object({
    alias: accountAliasSchema.optional(),
    name: accountAliasSchema.optional(),
    broker: accountBrokerSchema.optional(),
    accountKind: accountKindSchema.optional(),
    feeProfileId: z.string().trim().min(1).max(64).optional(),
    customFee: accountCustomFeeSchema.optional(),
  })
  .strict();

export const createPlanParamsSchema = z
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

export const createAlertParamsSchema = z
  .object({
    symbol: symbolSchema,
    title: z.string().trim().min(1).max(120),
    condition: z.enum(['at_or_above', 'at_or_below']),
    targetPrice: positiveNumberSchema,
  })
  .strict();

export const reviewAiDraftParamsSchema = z
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

export const executionImportInputSchema = z
  .object({
    sourcePath: z.string().min(1),
    accountId: z.string().trim().min(1).optional(),
    mapping: executionColumnMappingSchema,
  })
  .strict();

export const createReviewParamsSchema = z
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

export const createPlaybookRuleParamsSchema = z
  .object({
    content: z.string().trim().min(1).max(2_000),
    category: playbookCategorySchema,
    symbol: symbolSchema.nullable().optional(),
    checkTiming: playbookCheckTimingSchema.optional(),
    sourceReviewId: z.uuid().nullable().optional(),
  })
  .strict();

export const updatePlaybookRuleParamsSchema = z
  .object({
    content: z.string().trim().min(1).max(2_000).optional(),
    category: playbookCategorySchema.optional(),
    symbol: symbolSchema.nullable().optional(),
    checkTiming: playbookCheckTimingSchema.optional(),
    status: playbookStatusSchema.optional(),
  })
  .strict();
