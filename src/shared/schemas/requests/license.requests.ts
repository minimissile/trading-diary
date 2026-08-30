import { z } from 'zod';
export const licenseServiceRequests = [
  z.object({
    id: z.uuid(),
    method: z.literal('license.getStatus'),
    params: z.object({}).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('license.activate'),
    params: z.object({ code: z.string().trim().min(8).max(2_000) }).strict(),
  }),
] as const;
