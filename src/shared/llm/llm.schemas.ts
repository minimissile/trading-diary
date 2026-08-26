import { z } from 'zod';

const directionSchema = z.enum(['long', 'short']);

export const reviewSummarizeVariablesSchema = z
  .object({
    symbol: z.string().trim().min(1),
    title: z.string().trim().min(1),
    direction: directionSchema,
    planned: z.boolean(),
    entryPrice: z.number().finite().positive(),
    exitPrice: z.number().finite().positive(),
    quantity: z.number().finite().positive(),
    fees: z.number().finite().nonnegative(),
    pnl: z.number().finite(),
    executionScore: z.number().int().min(1).max(5),
    planThesis: z.string().optional(),
    planEntryPrice: z.number().finite().positive().optional(),
    planStopPrice: z.number().finite().positive().optional(),
    partialSummary: z.string().optional(),
    partialLesson: z.string().optional(),
  })
  .strict();

export type ReviewSummarizeVariables = z.infer<typeof reviewSummarizeVariablesSchema>;

export const reviewSummarizeOutputSchema = z
  .object({
    summary: z.string().trim().min(1),
    lesson: z.string().trim().min(1),
  })
  .strict();

export const releaseNotesVariablesSchema = z
  .object({
    version: z.string().trim().min(1),
    lastTag: z.string().nullable(),
    commitList: z.string().trim().min(1),
    date: z.string().trim().min(1),
  })
  .strict();

export const releasePlanVariablesSchema = z
  .object({
    currentVersion: z.string().trim().min(1),
    lastTag: z.string().nullable(),
    commitList: z.string().trim().min(1),
    date: z.string().trim().min(1),
  })
  .strict();

export const releasePlanOutputSchema = z
  .object({
    bump: z.enum(['patch', 'minor', 'major']),
    bumpReason: z.string().trim().min(1),
    releaseNotes: z.string().trim().min(1),
  })
  .strict();
