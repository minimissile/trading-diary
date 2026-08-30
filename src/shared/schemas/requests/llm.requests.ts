import { z } from 'zod';
export const llmServiceRequests = [
  z.object({
    id: z.uuid(),
    method: z.literal('llm.previewPrompt'),
    params: z
      .object({
        promptId: z.enum(['review.summarize', 'release.notes', 'release.plan']),
        variables: z.record(z.string(), z.string()),
      })
      .strict(),
  }),
] as const;
