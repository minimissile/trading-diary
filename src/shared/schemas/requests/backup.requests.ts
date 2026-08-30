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

export const backupServiceRequests = [
  z.object({
    id: z.uuid(),
    method: z.literal('backup.export'),
    params: z
      .object({
        targetPath: z.string().min(1),
        includeLicense: z.boolean().optional(),
      })
      .strict(),
  }),,
  z.object({
    id: z.uuid(),
    method: z.literal('backup.import'),
    params: z.object({ sourcePath: z.string().min(1) }).strict(),
  }),,
] as const;
