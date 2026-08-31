import { z } from 'zod';

const lofDirectionSchema = z.enum(['premium', 'discount', 'both']);
const lofRuleStatusSchema = z.enum(['active', 'paused', 'triggered']);
const lofEventActionSchema = z.enum(['acknowledged', 'dismissed']);

export const lofArbitrageServiceRequests = [
  z.object({
    id: z.uuid(),
    method: z.literal('lofArbitrage.listWatchItems'),
    params: z.object({}).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('lofArbitrage.addWatchItem'),
    params: z
      .object({
        symbol: z.string().trim().min(1).max(32),
        notes: z.string().trim().max(200).nullable().optional(),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('lofArbitrage.removeWatchItem'),
    params: z.object({ id: z.uuid() }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('lofArbitrage.listRules'),
    params: z.object({}).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('lofArbitrage.createRule'),
    params: z
      .object({
        symbol: z.string().trim().min(1).max(32).nullable().optional(),
        direction: lofDirectionSchema,
        thresholdRate: z.number().finite().positive(),
        minAmount: z.number().finite().nonnegative().nullable().optional(),
        requireSubscriptionOpen: z.boolean().optional(),
        minNetSpread: z.number().finite().nullable().optional(),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('lofArbitrage.setRuleStatus'),
    params: z.object({ id: z.uuid(), status: lofRuleStatusSchema }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('lofArbitrage.deleteRule'),
    params: z.object({ id: z.uuid() }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('lofArbitrage.getSnapshot'),
    params: z.object({ symbol: z.string().trim().min(1).max(32) }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('lofArbitrage.refreshMonitor'),
    params: z.object({}).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('lofArbitrage.scanMarket'),
    params: z
      .object({
        limit: z.number().int().positive().max(200).optional(),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('lofArbitrage.listEvents'),
    params: z.object({ limit: z.number().int().positive().max(200).optional() }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('lofArbitrage.setEventAction'),
    params: z.object({ id: z.uuid(), action: lofEventActionSchema }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('lofArbitrage.pollActive'),
    params: z.object({}).strict(),
  }),
] as const;
