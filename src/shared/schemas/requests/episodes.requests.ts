import { z } from 'zod';
import { assetHashSchema, nonNegativeNumberSchema, positiveNumberSchema, symbolSchema } from '../primitives';
import {
  accountCustomFeeSchema,
  alertEventActionSchema,
  alertStatusSchema,
  createAccountParamsSchema,
  createAlertParamsSchema,
  createPlanParamsSchema,
  createPlaybookRuleParamsSchema,
  createReviewParamsSchema,
  executionImportInputSchema,
  playbookStatusSchema,
  planStatusSchema,
  reviewAiDraftParamsSchema,
  updateAccountInputSchema,
  updatePlaybookRuleParamsSchema,
} from '../params';

export const episodesServiceRequests = [
  z.object({
    id: z.uuid(),
    method: z.literal('episodes.list'),
    params: z.object({ accountId: z.string().trim().min(1).optional() }).strict(),
  }),,
  z.object({
    id: z.uuid(),
    method: z.literal('episodes.get'),
    params: z.object({ id: z.uuid() }).strict(),
  }),,
  z.object({
    id: z.uuid(),
    method: z.literal('episodes.addExecution'),
    params: z
      .object({
        accountId: z.string().trim().min(1).optional(),
        symbol: symbolSchema,
        side: z.enum(['buy', 'sell']),
        quantity: positiveNumberSchema,
        price: positiveNumberSchema,
        fees: nonNegativeNumberSchema.optional(),
        tradeAt: z.string().trim().min(1),
        planId: z.uuid().nullable().optional(),
        note: z.string().trim().max(500).optional(),
        source: z.enum(['manual', 'csv', 'plan']).optional(),
      })
      .strict(),
  }),,
] as const;
