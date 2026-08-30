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

export const importServiceRequests = [
  z.object({
    id: z.uuid(),
    method: z.literal('import.parseCsv'),
    params: z.object({ sourcePath: z.string().min(1) }).strict(),
  }),,
  z.object({
    id: z.uuid(),
    method: z.literal('import.previewExecutions'),
    params: executionImportInputSchema,
  }),,
  z.object({
    id: z.uuid(),
    method: z.literal('import.commitExecutions'),
    params: executionImportInputSchema,
  }),,
] as const;
