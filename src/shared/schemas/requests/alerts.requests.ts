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

export const alertsServiceRequests = [
  z.object({
    id: z.uuid(),
    method: z.literal('alerts.list'),
    params: z.object({}).strict(),
  }),,
  z.object({
    id: z.uuid(),
    method: z.literal('alerts.create'),
    params: createAlertParamsSchema,
  }),,
  z.object({
    id: z.uuid(),
    method: z.literal('alerts.setStatus'),
    params: z.object({ id: z.uuid(), status: alertStatusSchema }).strict(),
  }),,
  z.object({
    id: z.uuid(),
    method: z.literal('alerts.evaluatePrice'),
    params: z.object({ symbol: symbolSchema, price: positiveNumberSchema }).strict(),
  }),,
  z.object({
    id: z.uuid(),
    method: z.literal('alerts.listEvents'),
    params: z.object({ limit: z.number().int().min(1).max(500).optional() }).strict(),
  }),,
  z.object({
    id: z.uuid(),
    method: z.literal('alerts.setEventAction'),
    params: z.object({ id: z.uuid(), action: alertEventActionSchema }).strict(),
  }),,
  z.object({
    id: z.uuid(),
    method: z.literal('alerts.pollActive'),
    params: z.object({}).strict(),
  }),,
] as const;
