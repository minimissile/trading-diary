import { z } from 'zod';
import { ACCOUNT_BROKER_IDS } from './accounts/brokers';

export const assetHashSchema = z.string().regex(/^[a-f0-9]{64}$/u);

const positiveNumberSchema = z.coerce.number().finite().positive();
const nonNegativeNumberSchema = z.coerce.number().finite().nonnegative();
const symbolSchema = z.string().trim().min(1).max(32);
const accountBrokerSchema = z.enum(ACCOUNT_BROKER_IDS);
const accountKindSchema = z.enum(['securities', 'fund']);
const accountCustomFeeSchema = z
  .object({
    commissionWan: nonNegativeNumberSchema,
    commissionMinYuan: nonNegativeNumberSchema.optional(),
    noCommissionMin: z.boolean().optional(),
    etfCommissionWan: nonNegativeNumberSchema.optional(),
    etfCommissionMinYuan: nonNegativeNumberSchema.optional(),
    etfNoCommissionMin: z.boolean().optional(),
  })
  .strict();
const accountAliasSchema = z.string().trim().max(80);

const createAccountParamsSchema = z
  .object({
    alias: accountAliasSchema.optional(),
    name: accountAliasSchema.optional(),
    broker: accountBrokerSchema.optional(),
    accountKind: accountKindSchema.optional(),
    currency: z.string().trim().min(3).max(8).optional(),
    marketScope: z.array(z.string().trim().min(1).max(32)).optional(),
    feeProfileId: z.string().trim().min(1).max(64).optional(),
    customFee: accountCustomFeeSchema.optional(),
    isDefault: z.boolean().optional(),
  })
  .strict();

const updateAccountInputSchema = z
  .object({
    alias: accountAliasSchema.optional(),
    name: accountAliasSchema.optional(),
    broker: accountBrokerSchema.optional(),
    accountKind: accountKindSchema.optional(),
    feeProfileId: z.string().trim().min(1).max(64).optional(),
    customFee: accountCustomFeeSchema.optional(),
  })
  .strict();
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

const executionColumnMappingSchema = z
  .object({
    symbol: z.number().int().min(-1),
    side: z.number().int().min(-1),
    quantity: z.number().int().min(-1),
    price: z.number().int().min(-1),
    fees: z.number().int().min(-1),
    tradeAt: z.number().int().min(-1),
  })
  .strict();

const executionImportInputSchema = z
  .object({
    sourcePath: z.string().min(1),
    accountId: z.string().trim().min(1).optional(),
    mapping: executionColumnMappingSchema,
  })
  .strict();

const createReviewParamsSchema = z
  .object({
    planId: z.uuid().nullable(),
    episodeId: z.uuid().nullable().optional(),
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
    saveToPlaybook: z.boolean().optional(),
  })
  .strict();

const playbookCategorySchema = z.enum(['entry', 'position', 'stop', 'exit', 'market', 'emotion', 'process']);
const playbookStatusSchema = z.enum(['active', 'archived']);
const playbookCheckTimingSchema = z.enum(['plan_activation', 'always']);
const alertEventActionSchema = z.enum(['acknowledged', 'snoozed', 'dismissed', 'completed']);

const createPlaybookRuleParamsSchema = z
  .object({
    content: z.string().trim().min(1).max(2_000),
    category: playbookCategorySchema,
    symbol: symbolSchema.nullable().optional(),
    checkTiming: playbookCheckTimingSchema.optional(),
    sourceReviewId: z.uuid().nullable().optional(),
  })
  .strict();

const updatePlaybookRuleParamsSchema = z
  .object({
    content: z.string().trim().min(1).max(2_000).optional(),
    category: playbookCategorySchema.optional(),
    symbol: symbolSchema.nullable().optional(),
    checkTiming: playbookCheckTimingSchema.optional(),
    status: playbookStatusSchema.optional(),
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
  z.object({
    id: z.uuid(),
    method: z.literal('accounts.list'),
    params: z.object({ includeArchived: z.boolean().optional() }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('accounts.get'),
    params: z.object({ id: z.string().trim().min(1).max(64) }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('accounts.create'),
    params: createAccountParamsSchema,
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('accounts.update'),
    params: z
      .object({
        id: z.string().trim().min(1).max(64),
        input: updateAccountInputSchema,
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('accounts.setDefault'),
    params: z.object({ id: z.string().trim().min(1).max(64) }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('accounts.archive'),
    params: z.object({ id: z.string().trim().min(1).max(64) }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('accounts.listFeeProfiles'),
    params: z.object({}).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('accounts.estimateFees'),
    params: z
      .object({
        side: z.enum(['buy', 'sell']),
        market: z.enum(['SH', 'SZ']).nullable(),
        price: positiveNumberSchema,
        quantity: positiveNumberSchema,
        feeProfileId: z.string().trim().min(1).max(64).optional(),
        accountId: z.string().trim().min(1).max(64).optional(),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('accounts.estimateFeesForSymbol'),
    params: z
      .object({
        accountId: z.string().trim().min(1).max(64).optional(),
        feeProfileId: z.string().trim().min(1).max(64).optional(),
        side: z.enum(['buy', 'sell']),
        symbol: symbolSchema,
        price: positiveNumberSchema,
        quantity: positiveNumberSchema,
      })
      .strict(),
  }),
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
  z.object({
    id: z.uuid(),
    method: z.literal('episodes.list'),
    params: z.object({ accountId: z.string().trim().min(1).optional() }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('episodes.get'),
    params: z.object({ id: z.uuid() }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('episodes.addExecution'),
    params: z
      .object({
        accountId: z.string().trim().min(1).optional(),
        symbol: symbolSchema,
        side: z.enum(['buy', 'sell']),
        quantity: positiveNumberSchema,
        price: positiveNumberSchema,
        fees: nonNegativeNumberSchema.optional(),
        tradeAt: z.string().trim().min(1),
        planId: z.uuid().nullable().optional(),
        note: z.string().trim().max(500).optional(),
        source: z.enum(['manual', 'csv', 'plan']).optional(),
      })
      .strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('import.parseCsv'),
    params: z.object({ sourcePath: z.string().min(1) }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('import.previewExecutions'),
    params: executionImportInputSchema,
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('import.commitExecutions'),
    params: executionImportInputSchema,
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('playbook.list'),
    params: z.object({ status: playbookStatusSchema.optional() }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('playbook.create'),
    params: createPlaybookRuleParamsSchema,
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('playbook.update'),
    params: z.object({ id: z.uuid(), input: updatePlaybookRuleParamsSchema }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('playbook.archive'),
    params: z.object({ id: z.uuid() }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('playbook.activationChecklist'),
    params: z.object({ symbol: symbolSchema.optional() }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('alerts.listEvents'),
    params: z.object({ limit: z.number().int().min(1).max(500).optional() }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('alerts.setEventAction'),
    params: z.object({ id: z.uuid(), action: alertEventActionSchema }).strict(),
  }),
  z.object({
    id: z.uuid(),
    method: z.literal('alerts.pollActive'),
    params: z.object({}).strict(),
  }),
]);
