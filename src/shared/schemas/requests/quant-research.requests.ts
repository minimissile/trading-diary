import { z } from 'zod';
import { quantSettingsSchema } from '../../quant-research/schemas';

export const quantResearchServiceRequests = [
  z.object({ id: z.uuid(), method: z.literal('quantResearch.state'), params: z.object({}).strict() }),
  z.object({ id: z.uuid(), method: z.literal('quantResearch.save'), params: quantSettingsSchema }),
  z.object({ id: z.uuid(), method: z.literal('quantResearch.scan'), params: quantSettingsSchema }),
  z.object({ id: z.uuid(), method: z.literal('quantResearch.run'), params: z.object({ id: z.uuid() }).strict() }),
] as const;
