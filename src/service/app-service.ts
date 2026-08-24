import path from 'node:path';
import type { ServiceRequest } from '../shared/service.types';
import { ImageStore } from './assets/image-store';
import { AppDatabase } from './database/database';

export class AppService {
  private readonly startedAt = new Date().toISOString();
  private readonly database: AppDatabase;
  private readonly images: ImageStore;

  constructor(dataDir: string) {
    this.database = new AppDatabase(path.join(dataDir, 'database', 'app.sqlite'));
    this.images = new ImageStore(dataDir, this.database);
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
    }
  }
}
