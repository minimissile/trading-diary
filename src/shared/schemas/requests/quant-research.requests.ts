import { z } from 'zod';
import { quantSettingsSchema } from '../../quant-research/schemas';
import { researchKindSchema, researchRequestSchema } from '../../quant-research/workbench';

export const quantResearchServiceRequests = [
  z.object({
    id: z.uuid(),
    method: z.literal('quantResearch.toolState'),
    params: z.object({ kind: researchKindSchema }).strict(),
  }),
  z.object({ id: z.uuid(), method: z.literal('quantResearch.toolSave'), params: researchRequestSchema }),
  z.object({ id: z.uuid(), method: z.literal('quantResearch.toolRun'), params: researchRequestSchema }),
  z.object({ id: z.uuid(), method: z.literal('quantResearch.report'), params: z.object({ id: z.uuid() }).strict() }),
  z.object({ id: z.uuid(), method: z.literal('quantResearch.state'), params: z.object({}).strict() }),
  z.object({ id: z.uuid(), method: z.literal('quantResearch.save'), params: quantSettingsSchema }),
  z.object({ id: z.uuid(), method: z.literal('quantResearch.scan'), params: quantSettingsSchema }),
  z.object({ id: z.uuid(), method: z.literal('quantResearch.run'), params: z.object({ id: z.uuid() }).strict() }),
] as const;
