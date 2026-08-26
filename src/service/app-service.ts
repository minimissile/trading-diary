import path from 'node:path';
import { z } from 'zod';
import { PROMPT_IDS } from '../shared/llm/prompt-id';
import { LlmError } from '../shared/llm/errors';
import type { ServiceRequest, ServiceStreamEvent, ServiceStreamMethod } from '../shared/service.types';
import { ImageStore } from './assets/image-store';
import { AppDatabase } from './database/database';
import { debugRunStream, previewPrompt } from './llm/debug-service';
import { createLlmRunner, type LlmRunner } from './llm/llm-runner';
import { generateReviewAiDraft, generateReviewAiDraftStream } from './reviews/review-ai-service';
import { marketService } from './market/market-service';

const reviewAiDraftParamsSchema = z
  .object({
    planId: z.uuid().nullable(),
    symbol: z.string().trim().min(1).max(32),
    title: z.string().trim().min(1).max(120),
    direction: z.enum(['long', 'short']),
    planned: z.boolean(),
    entryPrice: z.number().finite().positive(),
    exitPrice: z.number().finite().positive(),
    quantity: z.number().finite().positive(),
    fees: z.number().finite().nonnegative(),
    executionScore: z.number().int().min(1).max(5),
    partialSummary: z.string().trim().max(2_000).optional(),
    partialLesson: z.string().trim().max(2_000).optional(),
  })
  .strict();

const llmPreviewParamsSchema = z
  .object({
    promptId: z.enum([PROMPT_IDS.REVIEW_SUMMARIZE, PROMPT_IDS.RELEASE_NOTES, PROMPT_IDS.RELEASE_PLAN]),
    variables: z.record(z.string(), z.string()),
  })
  .strict();

const llmDebugRunParamsSchema = z
  .object({
    promptId: z.enum([PROMPT_IDS.REVIEW_SUMMARIZE, PROMPT_IDS.RELEASE_NOTES, PROMPT_IDS.RELEASE_PLAN]),
    variables: z.record(z.string(), z.string()),
  })
  .strict();

export class AppService {
  private readonly startedAt = new Date().toISOString();
  private readonly database: AppDatabase;
  private readonly images: ImageStore;
  private readonly llmRunner: LlmRunner;

  constructor(dataDir: string) {
    this.database = new AppDatabase(path.join(dataDir, 'database', 'app.sqlite'));
    this.images = new ImageStore(dataDir, this.database);
    this.llmRunner = createLlmRunner(dataDir);
  }

  close(): void {
    this.database.close();
  }

  async handle(request: ServiceRequest): Promise<unknown> {
    switch (request.method) {
      case 'system.health':
        return {
          servicePid: process.pid,
          startedAt: this.startedAt,
          sqliteVersion: this.database.sqliteVersion(),
          schemaVersion: this.database.schemaVersion(),
          storageReady: true,
        };
      case 'assets.stats':
        return this.images.stats();
      case 'assets.import':
        return this.images.importFile(request.params.sourcePath);
      case 'assets.resolve':
        return {
          filePath: await this.images.resolve(request.params.hash, request.params.variant),
        };
      case 'workspace.snapshot':
        return this.database.workspaceSnapshot();
      case 'plans.list':
        return this.database.listTradingPlans();
      case 'plans.create':
        return this.database.createTradingPlan(request.params);
      case 'plans.setStatus':
        return this.database.setTradingPlanStatus(request.params.id, request.params.status);
      case 'alerts.list':
        return this.database.listTradeAlerts();
      case 'alerts.create':
        return this.database.createTradeAlert(request.params);
      case 'alerts.setStatus':
        return this.database.setTradeAlertStatus(request.params.id, request.params.status);
      case 'alerts.evaluatePrice':
        return this.database.evaluatePrice(request.params.symbol, request.params.price);
      case 'reviews.list':
        return this.database.listTradeReviews();
      case 'reviews.create':
        return this.database.createTradeReview(request.params);
      case 'reviews.generateAiDraft':
        return generateReviewAiDraft(this.database, this.llmRunner, request.params);
      case 'settings.saveLlmApiKey': {
        const store = this.llmRunner.getCredentialStore();
        if (!store) throw new Error('凭据存储不可用');
        store.saveApiKey(request.params.apiKey);
        return { configured: true };
      }
      case 'settings.getLlmStatus': {
        const store = this.llmRunner.getCredentialStore();
        return { configured: Boolean(store?.hasConfiguredKey()) };
      }
      case 'settings.testLlmConnection':
        return this.llmRunner.testConnection();
      case 'settings.getLlmUsage': {
        const summary = this.llmRunner.getUsageSummary();
        if (!summary) throw new Error('用量统计不可用');
        return summary;
      }
      case 'settings.getLlmSettings': {
        const settings = this.llmRunner.getSettings();
        if (!settings) throw new Error('AI 设置不可用');
        return settings;
      }
      case 'settings.saveLlmSettings':
        return this.llmRunner.saveSettings(request.params);
      case 'llm.previewPrompt': {
        const params = llmPreviewParamsSchema.parse(request.params);
        return previewPrompt(this.llmRunner, params.promptId, params.variables);
      }
      case 'market.resolve':
        return marketService.resolve(request.params.symbol);
      case 'market.search':
        return marketService.search(request.params.query, request.params.limit);
      case 'market.getQuote':
        return marketService.getQuote(request.params.symbol);
      case 'market.getQuotes':
        return marketService.getQuotes(request.params.symbols);
      case 'market.getSnapshot':
        return marketService.getSnapshot(request.params.symbol);
      case 'market.listDividends':
        return marketService.listDividends(
          request.params.symbol,
          request.params.page,
          request.params.pageSize,
        );
      case 'market.listNews':
        return marketService.listNews(request.params.symbol, request.params.pageSize);
    }
  }

  cancelStream(streamId: string): void {
    this.llmRunner.cancelStream(streamId);
  }

  async handleStream(
    streamId: string,
    method: ServiceStreamMethod,
    params: unknown,
    emit: (event: ServiceStreamEvent) => void,
  ): Promise<void> {
    const emitError = (error: unknown): void => {
      emit({
        type: 'error',
        code: error instanceof LlmError ? error.code : 'SERVICE_ERROR',
        message: error instanceof Error ? error.message : '未知后台服务错误',
      });
    };

    try {
      switch (method) {
        case 'reviews.generateAiDraftStream': {
          const input = reviewAiDraftParamsSchema.parse(params);
          const result = await generateReviewAiDraftStream(this.database, this.llmRunner, input, {
            streamId,
            onChunk: (delta) => emit({ type: 'chunk', delta }),
          });
          emit({ type: 'done', result });
          return;
        }
        case 'llm.debugRunStream': {
          const parsed = llmDebugRunParamsSchema.parse(params);
          const result = await debugRunStream(this.llmRunner, parsed.promptId, parsed.variables, {
            streamId,
            onChunk: (delta) => emit({ type: 'chunk', delta }),
          });
          emit({ type: 'done', result });
          return;
        }
      }
    } catch (error) {
      emitError(error);
    }
  }
}
