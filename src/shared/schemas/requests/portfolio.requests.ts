import { z } from 'zod';
import { nonNegativeNumberSchema, positiveNumberSchema, symbolSchema } from '../primitives';

const ledgerAiExtractedRecordSchema = z
  .object({
    rowIndex: z.number().int().positive(),
    symbol: z.string().trim().max(32).nullable(),
    instrumentName: z.string().trim().max(120).nullable(),
    side: z.enum(['buy', 'sell']).nullable(),
    tradeAt: z.string().trim().max(64).nullable(),
    price: z.number().finite().nullable(),
    quantity: z.number().finite().nullable(),
    amount: z.number().finite().nullable(),
    fees: z.number().finite().nullable(),
    note: z.string().trim().max(500).nullable(),
    rawType: z.string().trim().max(64).nullable(),
    recordKind: z.enum(['trade', 'sip_deduction', 'dividend', 'skip']),
    tradeChannel: z.enum(['exchange', 'otc']).nullable().optional(),
    confirmAt: z.string().trim().max(64).nullable().optional(),
    amountIsNetConfirmed: z.boolean().optional(),
    sourceImageIndex: z.number().int().nonnegative(),
    sourceFileName: z.string().trim().max(256).nullable(),
  })
  .strict();

const ledgerAiImportParamsSchema = z
  .object({
    accountId: z.string().trim().min(1).max(64).optional(),
    records: z.array(ledgerAiExtractedRecordSchema),
    importAssetKind: z.enum(['stock', 'fund']).optional(),
    defaultTradeChannel: z.enum(['exchange', 'otc']).optional(),
    importSipDeductions: z.boolean().optional(),
    sipPlanMode: z.enum(['fixed', 'smart', 'unknown']).optional(),
    sipPlanModeLabel: z.string().trim().max(64).nullable().optional(),
    sipPlanHints: z
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
  .strict();

export const portfolioServiceRequests = [
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.listPositions'),
    params: z.object({ accountId: z.string().trim().min(1).max(64).optional() }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.getSummary'),
    params: z
      .object({
        accountId: z.string().trim().min(1).max(64).optional(),
        year: z.number().int().min(2000).max(2100).optional(),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.getDividendCalendar'),
    params: z
      .object({
        accountId: z.string().trim().min(1).max(64).optional(),
        month: z.string().regex(/^\d{4}-\d{2}$/u),
      })
      .strict(),
  }),
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
  }),
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
        source: z.enum(['manual', 'csv', 'plan', 'sip', 'ai_import']).optional(),
        sipOccurrenceId: z.uuid().nullable().optional(),
        cashOutflow: nonNegativeNumberSchema.nullable().optional(),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.listLedgerEntries'),
    params: z
      .object({
        accountId: z.string().trim().min(1).max(64).optional(),
        symbol: symbolSchema.optional(),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.getRealizedHistory'),
    params: z
      .object({
        accountId: z.string().trim().min(1).max(64).optional(),
        year: z.number().int().min(2000).max(2100).optional(),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.getPnlCalendar'),
    params: z
      .object({
        accountId: z.string().trim().min(1).max(64).optional(),
        month: z.string().regex(/^\d{4}-\d{2}$/u).optional(),
      })
      .strict(),
  }),
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
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.deleteLedgerEntry'),
    params: z.object({ id: z.uuid() }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.deletePosition'),
    params: z
      .object({
        accountId: z.string().trim().min(1).max(64).optional(),
        symbol: symbolSchema,
      })
      .strict(),
  }),
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
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.refreshDividends'),
    params: z
      .object({
        accountId: z.string().trim().min(1).max(64).optional(),
        symbol: symbolSchema.optional(),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.syncMarketQuotes'),
    params: z.object({ accountId: z.string().trim().min(1).max(64).optional() }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.getDividendGoal'),
    params: z.object({ accountId: z.string().trim().min(1).max(64).optional() }).strict(),
  }),
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
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.getDividendPayoutDefault'),
    params: z
      .object({
        accountId: z.string().trim().min(1).max(64),
        symbol: symbolSchema,
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.setDividendPayoutMode'),
    params: z
      .object({
        id: z.uuid(),
        payoutMode: z.enum(['cash', 'reinvest']),
        setDefault: z.boolean().optional(),
        accountId: z.string().trim().min(1).max(64).optional(),
        year: z.number().int().min(2000).max(2100).optional(),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.saveLedgerImportPasteImages'),
    params: z
      .object({
        images: z
          .array(
            z
              .object({
                data: z.string().trim().min(1).max(20_000_000),
                mimeType: z.string().trim().min(1).max(64),
              })
              .strict(),
          )
          .min(1)
          .max(20),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.readLedgerImportImagePreviews'),
    params: z
      .object({
        sourcePaths: z.array(z.string().trim().min(1).max(4096)).min(1).max(20),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.recognizeLedgerImportScreenshots'),
    params: z
      .object({
        sourcePaths: z.array(z.string().trim().min(1).max(4096)).min(1).max(20),
        importAssetKind: z.enum(['stock', 'fund']).optional(),
        defaultTradeChannel: z.enum(['exchange', 'otc']).optional(),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.previewLedgerAiImport'),
    params: ledgerAiImportParamsSchema,
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('portfolio.commitLedgerAiImport'),
    params: ledgerAiImportParamsSchema,
  }),
] as const;
