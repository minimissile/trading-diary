import { z } from 'zod';
import { symbolSchema } from '../primitives';
export const marketServiceRequests = [
  z.object({
    id: z.uuid(),
    method: z.literal('market.resolve'),
    params: z.object({ symbol: symbolSchema }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('market.search'),
    params: z
      .object({
        query: z.string().trim().min(1).max(32),
        limit: z.number().int().min(1).max(20).optional(),
        marketScopes: z.array(z.enum(['CN_A', 'HK', 'US'])).optional(),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('market.getQuote'),
    params: z.object({ symbol: symbolSchema }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('market.getQuotes'),
    params: z.object({ symbols: z.array(symbolSchema).min(1).max(20) }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('market.getSnapshot'),
    params: z.object({ symbol: symbolSchema }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('market.listDividends'),
    params: z
      .object({
        symbol: symbolSchema,
        page: z.number().int().min(1).max(100).optional(),
        pageSize: z.number().int().min(1).max(50).optional(),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('market.listNews'),
    params: z
      .object({
        symbol: symbolSchema,
        pageSize: z.number().int().min(1).max(20).optional(),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('market.listKlines'),
    params: z
      .object({
        symbol: symbolSchema,
        period: z.enum(['1m', '5m', '15m', '30m', '60m', '1d', '1w', '1M']).optional(),
        adjust: z.enum(['none', 'forward', 'backward']).optional(),
        limit: z.number().int().min(1).max(1023).optional(),
        beforeTimestamp: z.number().int().positive().optional(),
      })
      .strict(),
  }),
] as const;
