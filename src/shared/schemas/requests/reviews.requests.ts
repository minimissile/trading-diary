import { z } from 'zod';
import { createReviewParamsSchema, reviewAiDraftParamsSchema } from '../params';
export const reviewsServiceRequests = [
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
  z.object({
    id: z.uuid(),
    method: z.literal('reviews.generateAiDraft'),
    params: reviewAiDraftParamsSchema,
  }),
] as const;
