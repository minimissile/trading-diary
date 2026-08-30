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

export const reviewsServiceRequests = [
  z.object({
    id: z.uuid(),
    method: z.literal('reviews.list'),
    params: z.object({}).strict(),
  }),,
  z.object({
    id: z.uuid(),
    method: z.literal('reviews.create'),
    params: createReviewParamsSchema,
  }),,
  z.object({
    id: z.uuid(),
    method: z.literal('reviews.generateAiDraft'),
    params: reviewAiDraftParamsSchema,
  }),,
] as const;
