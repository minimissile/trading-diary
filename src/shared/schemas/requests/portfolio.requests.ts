import { z } from 'zod';
import { assetHashSchema, nonNegativeNumberSchema, positiveNumberSchema, symbolSchema } from '../primitives';
import {
  accountCustomFeeSchema,
  alertEventActionSchema,
  alertStatusSchema,
  createAccountParamsSchema,
  createAlertParamsSchema,
  createPlanParamsSchema,
  createPlaybookRuleParamsSchema,
  createReviewParamsSchema,
  executionImportInputSchema,
  playbookStatusSchema,
  planStatusSchema,
  reviewAiDraftParamsSchema,
  updateAccountInputSchema,
  updatePlaybookRuleParamsSchema,
} from '../params';

export const portfolioServiceRequests = [
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.listPositions'),
    params: z.object({ accountId: z.string().trim().min(1).max(64).optional() }).strict(),
  }),,
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.getSummary'),
    params: z
      .object({
        accountId: z.string().trim().min(1).max(64).optional(),
        year: z.number().int().min(2000).max(2100).optional(),
      })
      .strict(),
  }),,
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.getDividendCalendar'),
    params: z
      .object({
        accountId: z.string().trim().min(1).max(64).optional(),
        month: z.string().regex(/^\d{4}-\d{2}$/u),
      })
      .strict(),
  }),,
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.listDividends'),
    params: z
      .object({
        accountId: z.string().trim().min(1).max(64).optional(),
        year: z.number().int().min(2000).max(2100).optional(),
        statuses: z.array(z.enum(['estimated', 'confirmed', 'rejected'])).optional(),
      })
      .strict(),
  }),,
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.addLedgerEntry'),
    params: z
      .object({
        accountId: z.string().trim().min(1).max(64).optional(),
        symbol: symbolSchema,
        kind: z.enum(['stock', 'etf', 'lof', 'otc_fund']).optional(),
        side: z.enum(['buy', 'sell', 'dividend_reinvest']),
        quantity: positiveNumberSchema,
        price: positiveNumberSchema,
        fees: nonNegativeNumberSchema.optional(),
        tradeAt: z.string().trim().min(1).max(40),
        planId: z.uuid().nullable().optional(),
        note: z.string().trim().max(500).optional(),
        source: z.enum(['manual', 'csv', 'plan', 'sip']).optional(),
        sipOccurrenceId: z.uuid().nullable().optional(),
      })
      .strict(),
  }),,
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.listLedgerEntries'),
    params: z
      .object({
        accountId: z.string().trim().min(1).max(64).optional(),
        symbol: symbolSchema.optional(),
      })
      .strict(),
  }),,
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.getRealizedHistory'),
    params: z
      .object({
        accountId: z.string().trim().min(1).max(64).optional(),
        year: z.number().int().min(2000).max(2100).optional(),
      })
      .strict(),
  }),,
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.getPnlCalendar'),
    params: z
      .object({
        accountId: z.string().trim().min(1).max(64).optional(),
        month: z.string().regex(/^\d{4}-\d{2}$/u).optional(),
      })
      .strict(),
  }),,
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.updateLedgerEntry'),
    params: z
      .object({
        id: z.uuid(),
        input: z
          .object({
            side: z.enum(['buy', 'sell', 'dividend_reinvest']).optional(),
            quantity: positiveNumberSchema.optional(),
            price: positiveNumberSchema.optional(),
            fees: nonNegativeNumberSchema.optional(),
            tradeAt: z.string().trim().min(1).max(40).optional(),
            note: z.string().trim().max(500).optional(),
          })
          .strict(),
      })
      .strict(),
  }),,
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.deleteLedgerEntry'),
    params: z.object({ id: z.uuid() }).strict(),
  }),,
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.deletePosition'),
    params: z
      .object({
        accountId: z.string().trim().min(1).max(64).optional(),
        symbol: symbolSchema,
      })
      .strict(),
  }),,
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.confirmDividend'),
    params: z
      .object({
        id: z.uuid(),
        confirmed: z.boolean(),
        cashAmount: nonNegativeNumberSchema.optional(),
        accountId: z.string().trim().min(1).max(64).optional(),
        year: z.number().int().min(2000).max(2100).optional(),
      })
      .strict(),
  }),,
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.refreshDividends'),
    params: z
      .object({
        accountId: z.string().trim().min(1).max(64).optional(),
        symbol: symbolSchema.optional(),
      })
      .strict(),
  }),,
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.syncMarketQuotes'),
    params: z.object({ accountId: z.string().trim().min(1).max(64).optional() }).strict(),
  }),,
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.getDividendGoal'),
    params: z.object({ accountId: z.string().trim().min(1).max(64).optional() }).strict(),
  }),,
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.saveDividendGoal'),
    params: z
      .object({
        accountId: z.string().trim().min(1).max(64).optional(),
        settings: z
          .object({
            ytdTarget: positiveNumberSchema.nullable(),
            dailyTarget: positiveNumberSchema.nullable(),
          })
          .strict()
          .nullable(),
      })
      .strict(),
  }),,
] as const;
