import path from 'node:path';
import type { ServiceRequest } from '../shared/service.types';
import { ImageStore } from './assets/image-store';
import { AppDatabase } from './database/database';
import { createLlmRunner, type LlmRunner } from './llm/llm-runner';
import { generateReviewAiDraft } from './reviews/review-ai-service';

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
    }
  }
}
