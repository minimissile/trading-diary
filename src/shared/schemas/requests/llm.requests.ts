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

export const llmServiceRequests = [
  z.object({
    id: z.uuid(),
    method: z.literal('llm.previewPrompt'),
    params: z
      .object({
        promptId: z.enum(['review.summarize', 'release.notes', 'release.plan']),
        variables: z.record(z.string(), z.string()),
      })
      .strict(),
  }),,
] as const;
