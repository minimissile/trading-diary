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

export const watchlistServiceRequests = [
  z.object({
    id: z.uuid(),
    method: z.literal('watchlist.listPools'),
    params: z.object({}).strict(),
  }),,
  z.object({
    id: z.uuid(),
    method: z.literal('watchlist.getPoolSnapshot'),
    params: z
      .object({
        poolId: z.enum(['dividend', 'growth', 'overlap']),
      })
      .strict(),
  }),,
] as const;
