import { z } from 'zod';

export const assetHashSchema = z.string().regex(/^[a-f0-9]{64}$/u);

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
]);
