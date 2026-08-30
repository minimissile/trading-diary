import { z } from 'zod';
import { nonNegativeNumberSchema, symbolSchema } from '../primitives';
export const sipServiceRequests = [
  z.object({
    id: z.uuid(),
    method: z.literal('sip.listPlans'),
    params: z
      .object({
        statuses: z.array(z.enum(['draft', 'active', 'paused', 'completed', 'cancelled'])).optional(),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('sip.getPlan'),
    params: z.object({ id: z.uuid() }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('sip.createPlan'),
    params: z
      .object({
        accountId: z.string().trim().min(1).max(64).optional(),
        symbol: symbolSchema,
        amount: nonNegativeNumberSchema.refine((value) => value > 0, '每期金额必须大于 0'),
        frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly']),
        dayOfWeek: z.number().int().min(1).max(7).optional(),
        dayOfMonth: z.number().int().min(1).max(28).optional(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        thesis: z.string().trim().min(1).max(2_000),
        activateNow: z.boolean().optional(),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('sip.updatePlan'),
    params: z
      .object({
        id: z.uuid(),
        input: z
          .object({
            amount: nonNegativeNumberSchema.optional(),
            frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly']).optional(),
            dayOfWeek: z.number().int().min(1).max(7).nullable().optional(),
            dayOfMonth: z.number().int().min(1).max(28).nullable().optional(),
            endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
            thesis: z.string().trim().min(1).max(2_000).optional(),
          })
          .strict(),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('sip.setStatus'),
    params: z
      .object({
        id: z.uuid(),
        status: z.enum(['draft', 'active', 'paused', 'completed', 'cancelled']),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('sip.deletePlan'),
    params: z.object({ id: z.uuid() }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('sip.previewSchedule'),
    params: z
      .object({
        accountId: z.string().trim().min(1).max(64).optional(),
        symbol: symbolSchema,
        amount: nonNegativeNumberSchema,
        frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly']),
        dayOfWeek: z.number().int().min(1).max(7).optional(),
        dayOfMonth: z.number().int().min(1).max(28).optional(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        thesis: z.string().trim().min(1).max(2_000),
        activateNow: z.boolean().optional(),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('sip.listOccurrences'),
    params: z
      .object({
        planId: z.uuid().optional(),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('sip.listOccurrenceViews'),
    params: z
      .object({
        planId: z.uuid().optional(),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('sip.confirmOccurrence'),
    params: z
      .object({
        id: z.uuid(),
        nav: nonNegativeNumberSchema.refine((value) => value > 0, '净值必须大于 0'),
        quantity: nonNegativeNumberSchema.optional(),
        fees: nonNegativeNumberSchema.optional(),
        tradeAt: z.string().datetime().optional(),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('sip.skipOccurrence'),
    params: z.object({ id: z.uuid(), reason: z.string().trim().min(1).max(500) }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('sip.getSummary'),
    params: z.object({}).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('sip.scanDue'),
    params: z.object({}).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('sip.getOccurrenceCalendar'),
    params: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('sip.getPositionMeta'),
    params: z.object({ accountId: z.string().trim().min(1).max(64).optional() }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('sip.getReviewTemplate'),
    params: z.object({ planId: z.uuid() }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('sip.getPlanPositionLink'),
    params: z.object({ planId: z.uuid() }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('sip.listPlansBySymbol'),
    params: z.object({ accountId: z.string().trim().min(1).max(64), symbol: z.string().trim().min(1).max(32) }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('sip.parseImportCsv'),
    params: z.object({ sourcePath: z.string().trim().min(1).max(4096) }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('sip.previewImport'),
    params: z
      .object({
        sourcePath: z.string().trim().min(1).max(4096),
        accountId: z.string().trim().min(1).max(64).optional(),
        planId: z.uuid().optional(),
        mapping: z
          .object({
            symbol: z.number().int().min(-1),
            tradeAt: z.number().int().min(-1),
            nav: z.number().int().min(-1),
            amount: z.number().int().min(-1),
            quantity: z.number().int().min(-1),
            fees: z.number().int().min(-1),
          })
          .strict(),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('sip.commitImport'),
    params: z
      .object({
        sourcePath: z.string().trim().min(1).max(4096),
        accountId: z.string().trim().min(1).max(64).optional(),
        planId: z.uuid().optional(),
        mapping: z
          .object({
            symbol: z.number().int().min(-1),
            tradeAt: z.number().int().min(-1),
            nav: z.number().int().min(-1),
            amount: z.number().int().min(-1),
            quantity: z.number().int().min(-1),
            fees: z.number().int().min(-1),
          })
          .strict(),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('sip.recognizeImportScreenshot'),
    params: z.object({ sourcePath: z.string().trim().min(1).max(4096) }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('sip.previewAiImport'),
    params: z
      .object({
        accountId: z.string().trim().min(1).max(64).optional(),
        planId: z.uuid().optional(),
        records: z.array(
          z
            .object({
              rowIndex: z.number().int().positive(),
              symbol: z.string().trim().max(32).nullable(),
              fundName: z.string().trim().max(120).nullable(),
              tradeAt: z.string().trim().max(64).nullable(),
              nav: z.number().finite().nullable(),
              amount: z.number().finite().nullable(),
              quantity: z.number().finite().nullable(),
              fees: z.number().finite().nullable(),
            })
            .strict(),
        ),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('sip.commitAiImport'),
    params: z
      .object({
        accountId: z.string().trim().min(1).max(64).optional(),
        planId: z.uuid().optional(),
        records: z.array(
          z
            .object({
              rowIndex: z.number().int().positive(),
              symbol: z.string().trim().max(32).nullable(),
              fundName: z.string().trim().max(120).nullable(),
              tradeAt: z.string().trim().max(64).nullable(),
              nav: z.number().finite().nullable(),
              amount: z.number().finite().nullable(),
              quantity: z.number().finite().nullable(),
              fees: z.number().finite().nullable(),
            })
            .strict(),
        ),
        planHints: z
          .object({
            symbol: z.string().trim().max(32).nullable().optional(),
            fundName: z.string().trim().max(120).nullable().optional(),
            amount: z.number().finite().nullable().optional(),
            startDate: z.string().trim().max(64).nullable().optional(),
            frequency: z.string().trim().max(32).nullable().optional(),
            dayOfMonth: z.number().int().nullable().optional(),
            dayOfWeek: z.number().int().nullable().optional(),
          })
          .strict()
          .nullable()
          .optional(),
      })
      .strict(),
  }),
] as const;
