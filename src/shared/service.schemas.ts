import { z } from 'zod';

export const assetHashSchema = z.string().regex(/^[a-f0-9]{64}$/u);

const positiveNumberSchema = z.number().finite().positive();
const nonNegativeNumberSchema = z.number().finite().nonnegative();
const symbolSchema = z.string().trim().min(1).max(32);
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

const createReviewParamsSchema = z
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
    summary: z.string().trim().min(1).max(2_000),
    lesson: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const serviceRequestSchema = z.discriminatedUnion('method', [
  z.object({
    id: z.uuid(),
    method: z.literal('system.health'),
    params: z.object({}).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('assets.stats'),
    params: z.object({}).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('assets.import'),
    params: z.object({ sourcePath: z.string().min(1) }),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('assets.resolve'),
    params: z.object({
      hash: assetHashSchema,
      variant: z.enum(['original', 'preview']),
    }),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('workspace.snapshot'),
    params: z.object({}).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('plans.list'),
    params: z.object({}).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('plans.create'),
    params: createPlanParamsSchema,
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('plans.setStatus'),
    params: z.object({ id: z.uuid(), status: planStatusSchema }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('alerts.list'),
    params: z.object({}).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('alerts.create'),
    params: createAlertParamsSchema,
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('alerts.setStatus'),
    params: z.object({ id: z.uuid(), status: alertStatusSchema }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('alerts.evaluatePrice'),
    params: z.object({ symbol: symbolSchema, price: positiveNumberSchema }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('reviews.list'),
    params: z.object({}).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('reviews.create'),
    params: createReviewParamsSchema,
  }),
]);
