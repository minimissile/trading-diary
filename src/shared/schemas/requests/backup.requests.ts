import { z } from 'zod';
export const backupServiceRequests = [
  z.object({
    id: z.uuid(),
    method: z.literal('backup.export'),
    params: z
      .object({
        targetPath: z.string().min(1),
        includeLicense: z.boolean().optional(),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('backup.import'),
    params: z.object({ sourcePath: z.string().min(1) }).strict(),
  }),
] as const;
