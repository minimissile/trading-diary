import { z } from 'zod';
import { symbolSchema } from '../primitives';

const changesShape = {
  starred: z.boolean().optional(),
  groupIds: z.array(z.uuid()).max(50).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  waitingFor: z.string().trim().max(2000).optional(),
  invalidation: z.string().trim().max(2000).optional(),
};
const idParams = z.object({ id: z.uuid() }).strict();
export const watchlistServiceRequests = [
  z.object({ id: z.uuid(), method: z.literal('watchlist.listPersonal'), params: z.object({}).strict() }),
  z.object({
    id: z.uuid(),
    method: z.literal('watchlist.add'),
    params: z.object({ symbol: symbolSchema, ...changesShape }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('watchlist.update'),
    params: z.object({ id: z.uuid(), changes: z.object(changesShape).strict() }).strict(),
  }),
  z.object({ id: z.uuid(), method: z.literal('watchlist.remove'), params: idParams }),
  z.object({
    id: z.uuid(),
    method: z.literal('watchlist.move'),
    params: z.object({ id: z.uuid(), direction: z.enum(['up', 'down']) }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('watchlist.saveGroup'),
    params: z.object({ id: z.uuid().optional(), name: z.string().trim().min(1).max(30) }).strict(),
  }),
  z.object({ id: z.uuid(), method: z.literal('watchlist.removeGroup'), params: idParams }),
  z.object({ id: z.uuid(), method: z.literal('watchlist.listLogs'), params: z.object({ itemId: z.uuid() }).strict() }),
  z.object({
    id: z.uuid(),
    method: z.literal('watchlist.saveLog'),
    params: z
      .object({
        id: z.uuid().optional(),
        itemId: z.uuid(),
        date: z.iso.date(),
        review: z.string().trim().max(10000),
        feeling: z.string().trim().max(10000),
      })
      .strict()
      .refine((value) => value.review.length > 0 || value.feeling.length > 0, { message: '请填写复盘记录或盘感记录' }),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('watchlist.removeLog'),
    params: z.object({ id: z.uuid(), itemId: z.uuid() }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('watchlist.setReminder'),
    params: z
      .object({
        id: z.uuid(),
        reminder: z
          .object({
            condition: z.enum(['at_or_above', 'at_or_below']),
            targetPrice: z.number().finite().min(0.0001).max(1_000_000_000),
          })
          .strict()
          .nullable(),
      })
      .strict(),
  }),
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
