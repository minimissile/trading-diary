import { z } from 'zod';
export const settingsServiceRequests = [
  z.object({
    id: z.uuid(),
    method: z.literal('settings.saveLlmApiKey'),
    params: z.object({ apiKey: z.string().trim().min(1) }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('settings.getLlmStatus'),
    params: z.object({}).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('settings.testLlmConnection'),
    params: z.object({}).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('settings.getLlmUsage'),
    params: z.object({}).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('settings.getLlmSettings'),
    params: z.object({}).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('settings.saveLlmSettings'),
    params: z
      .object({
        monthlyTokenBudget: z.number().int().positive().nullable(),
        debugLogging: z.boolean(),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('settings.getAccessLock'),
    params: z.object({}).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('settings.verifyAccessLock'),
    params: z.object({ password: z.string().min(1).max(64) }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('settings.enableAccessLock'),
    params: z.object({ newPassword: z.string().min(4).max(64) }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('settings.enableExistingAccessLock'),
    params: z.object({}).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('settings.disableAccessLock'),
    params: z.object({ password: z.string().min(1).max(64) }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('settings.changeAccessLockPassword'),
    params: z
      .object({
        currentPassword: z.string().min(1).max(64),
        newPassword: z.string().min(4).max(64),
      })
      .strict(),
  }),
] as const;
