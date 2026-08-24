import type { AssetStats, HealthResult, ImportedAsset } from './api.types';

export interface ServiceContract {
  'system.health': {
    params: Record<string, never>;
    result: HealthResult;
  };
  'assets.stats': {
    params: Record<string, never>;
    result: AssetStats;
  };
  'assets.import': {
    params: { sourcePath: string };
    result: ImportedAsset;
  };
  'assets.resolve': {
    params: { hash: string; variant: 'original' | 'preview' };
    result: { filePath: string | null };
  };
}

export type ServiceMethod = keyof ServiceContract;

export type ServiceRequest<M extends ServiceMethod = ServiceMethod> = {
  [K in M]: {
    id: string;
    method: K;
    params: ServiceContract[K]['params'];
  };
}[M];

export type ServiceResponse =
  | { id: string; ok: true; data: unknown }
  | { id: string; ok: false; error: { code: string; message: string } };

export type MainToServiceMessage =
  | { type: 'service:init'; dataDir: string }
  | { type: 'service:request'; request: ServiceRequest }
  | { type: 'service:shutdown' };

export type ServiceToMainMessage =
  | { type: 'service:ready' }
  | { type: 'service:response'; response: ServiceResponse }
  | { type: 'service:fatal'; message: string };
