import { z } from 'zod';

export const assetHashSchema = z.string().regex(/^[a-f0-9]{64}$/u);

const positiveNumberSchema = z.number().finite().positive();
const nonNegativeNumberSchema = z.number().finite().nonnegative();
const symbolSchema = z.string().trim().min(1).max(32);
const planStatusSchema = z.enum(['draft', 'watching', 'holding', 'completed', 'cancelled']);
const alertStatusSchema = z.enum(['active', 'triggered', 'completed', 'disabled']);
const directionSchema = z.enum(['long', 'short']);

const createPlanParamsSchema = z
  .object({
    symbol: symbolSchema,
    name: z.string().trim().min(1).max(80),
    direction: directionSchema,
    thesis: z.string().trim().min(1).max(1_000),
    entryPrice: positiveNumberSchema,
    stopPrice: positiveNumberSchema,
    targetPrice: positiveNumberSchema.nullable(),
    riskAmount: nonNegativeNumberSchema,
    activateNow: z.boolean(),
  })
  .strict();

const createAlertParamsSchema = z
  .object({
    symbol: symbolSchema,
    title: z.string().trim().min(1).max(120),
    condition: z.enum(['at_or_above', 'at_or_below']),
    targetPrice: positiveNumberSchema,
  })
  .strict();

const reviewAiDraftParamsSchema = z
  .object({
    planId: z.uuid().nullable(),
    symbol: symbolSchema,
    title: z.string().trim().min(1).max(120),
    direction: directionSchema,
    planned: z.boolean(),
    entryPrice: positiveNumberSchema,
    exitPrice: positiveNumberSchema,
    quantity: positiveNumberSchema,
    fees: nonNegativeNumberSchema,
    executionScore: z.number().int().min(1).max(5),
    partialSummary: z.string().trim().max(2_000).optional(),
    partialLesson: z.string().trim().max(2_000).optional(),
  })
  .strict();

const createReviewParamsSchema = z
  .object({
    planId: z.uuid().nullable(),
    symbol: symbolSchema,
    title: z.string().trim().min(1).max(120),
    direction: directionSchema,
    planned: z.boolean(),
    entryPrice: positiveNumberSchema,
    exitPrice: positiveNumberSchema,
    quantity: positiveNumberSchema,
    fees: nonNegativeNumberSchema,
    executionScore: z.number().int().min(1).max(5),
    summary: z.string().trim().min(1).max(2_000),
    lesson: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const serviceRequestSchema = z.discriminatedUnion('method', [
  z.object({
    id: z.uuid(),
    method: z.literal('system.health'),
    params: z.object({}).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('assets.stats'),
    params: z.object({}).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('assets.import'),
    params: z.object({ sourcePath: z.string().min(1) }),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('assets.resolve'),
    params: z.object({
      hash: assetHashSchema,
      variant: z.enum(['original', 'preview']),
    }),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('workspace.snapshot'),
    params: z.object({}).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('plans.list'),
    params: z.object({}).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('plans.create'),
    params: createPlanParamsSchema,
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('plans.setStatus'),
    params: z.object({ id: z.uuid(), status: planStatusSchema }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('alerts.list'),
    params: z.object({}).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('alerts.create'),
    params: createAlertParamsSchema,
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('alerts.setStatus'),
    params: z.object({ id: z.uuid(), status: alertStatusSchema }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('alerts.evaluatePrice'),
    params: z.object({ symbol: symbolSchema, price: positiveNumberSchema }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('reviews.list'),
    params: z.object({}).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('reviews.create'),
    params: createReviewParamsSchema,
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('reviews.generateAiDraft'),
    params: reviewAiDraftParamsSchema,
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('settings.saveLlmApiKey'),
    params: z.object({ apiKey: z.string().trim().min(1) }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('settings.getLlmStatus'),
    params: z.object({}).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('settings.testLlmConnection'),
    params: z.object({}).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('settings.getLlmUsage'),
    params: z.object({}).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('settings.getLlmSettings'),
    params: z.object({}).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('settings.saveLlmSettings'),
    params: z
      .object({
        monthlyTokenBudget: z.number().int().positive().nullable(),
        debugLogging: z.boolean(),
      })
      .strict(),
  }),
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
  z.object({
    id: z.uuid(),
    method: z.literal('market.resolve'),
    params: z.object({ symbol: symbolSchema }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('market.search'),
    params: z
      .object({
        query: z.string().trim().min(1).max(32),
        limit: z.number().int().min(1).max(20).optional(),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('market.getQuote'),
    params: z.object({ symbol: symbolSchema }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('market.getQuotes'),
    params: z.object({ symbols: z.array(symbolSchema).min(1).max(20) }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('market.getSnapshot'),
    params: z.object({ symbol: symbolSchema }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('market.listDividends'),
    params: z
      .object({
        symbol: symbolSchema,
        page: z.number().int().min(1).max(100).optional(),
        pageSize: z.number().int().min(1).max(50).optional(),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('market.listNews'),
    params: z
      .object({
        symbol: symbolSchema,
        pageSize: z.number().int().min(1).max(20).optional(),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('watchlist.listPools'),
    params: z.object({}).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('watchlist.getPoolSnapshot'),
    params: z
      .object({
        poolId: z.enum(['dividend', 'growth', 'overlap']),
      })
      .strict(),
  }),
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
        source: z.enum(['manual', 'csv', 'plan']).optional(),
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
    method: z.literal('license.getStatus'),
    params: z.object({}).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('license.activate'),
    params: z.object({ code: z.string().trim().min(8).max(2_000) }).strict(),
  }),
]);
