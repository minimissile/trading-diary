import { z } from 'zod';
export const watchlistServiceRequests = [
  z.object({
    id: z.uuid(),
    method: z.literal('watchlist.listPools'),
    params: z.object({}).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('watchlist.getPoolSnapshot'),
    params: z
      .object({
        poolId: z.enum(['dividend', 'growth', 'overlap']),
      })
      .strict(),
  }),
] as const;
