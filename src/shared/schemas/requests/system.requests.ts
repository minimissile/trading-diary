import { z } from 'zod';
export const systemServiceRequests = [
  z.object({
    id: z.uuid(),
    method: z.literal('system.health'),
    params: z.object({}).strict(),
  }),
] as const;
