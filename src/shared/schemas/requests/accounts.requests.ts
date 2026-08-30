import { z } from 'zod';
import { positiveNumberSchema, symbolSchema } from '../primitives';
import { createAccountParamsSchema, updateAccountInputSchema } from '../params';

export const accountsServiceRequests = [
  z.object({
    id: z.uuid(),
    method: z.literal('accounts.list'),
    params: z.object({ includeArchived: z.boolean().optional() }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('accounts.get'),
    params: z.object({ id: z.string().trim().min(1).max(64) }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('accounts.create'),
    params: createAccountParamsSchema,
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('accounts.update'),
    params: z
      .object({
        id: z.string().trim().min(1).max(64),
        input: updateAccountInputSchema,
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('accounts.setDefault'),
    params: z.object({ id: z.string().trim().min(1).max(64) }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('accounts.archive'),
    params: z.object({ id: z.string().trim().min(1).max(64) }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('accounts.delete'),
    params: z.object({ id: z.string().trim().min(1).max(64) }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('accounts.listFeeProfiles'),
    params: z.object({}).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('accounts.estimateFees'),
    params: z
      .object({
        side: z.enum(['buy', 'sell']),
        market: z.enum(['SH', 'SZ', 'HK', 'US']).nullable(),
        price: positiveNumberSchema,
        quantity: positiveNumberSchema,
        feeProfileId: z.string().trim().min(1).max(64).optional(),
        accountId: z.string().trim().min(1).max(64).optional(),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('accounts.estimateFeesForSymbol'),
    params: z
      .object({
        accountId: z.string().trim().min(1).max(64).optional(),
        feeProfileId: z.string().trim().min(1).max(64).optional(),
        side: z.enum(['buy', 'sell']),
        symbol: symbolSchema,
        price: positiveNumberSchema,
        quantity: positiveNumberSchema,
      })
      .strict(),
  }),
] as const;
