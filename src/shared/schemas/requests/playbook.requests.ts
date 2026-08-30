import { z } from 'zod';
import { symbolSchema, playbookStatusSchema } from '../primitives';
import { createPlaybookRuleParamsSchema, updatePlaybookRuleParamsSchema } from '../params';
export const playbookServiceRequests = [
  z.object({
    id: z.uuid(),
    method: z.literal('playbook.list'),
    params: z.object({ status: playbookStatusSchema.optional() }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('playbook.create'),
    params: createPlaybookRuleParamsSchema,
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('playbook.update'),
    params: z.object({ id: z.uuid(), input: updatePlaybookRuleParamsSchema }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('playbook.archive'),
    params: z.object({ id: z.uuid() }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('playbook.activationChecklist'),
    params: z.object({ symbol: symbolSchema.optional() }).strict(),
  }),
] as const;
