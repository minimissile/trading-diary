import { z } from 'zod';
import { planStatusSchema } from '../primitives';
import { createPlanParamsSchema } from '../params';
export const plansServiceRequests = [
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
] as const;
