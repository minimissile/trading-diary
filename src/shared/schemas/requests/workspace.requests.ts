import { z } from 'zod';
export const workspaceServiceRequests = [
  z.object({
    id: z.uuid(),
    method: z.literal('workspace.snapshot'),
    params: z.object({}).strict(),
  }),
] as const;
