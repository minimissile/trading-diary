export interface SyncPage<T> {
  records: T[];
  nextCursor: string | null;
}

export interface Connector<TRaw, TNormalized> {
  readonly provider: string;
  testConnection(signal: AbortSignal): Promise<void>;
  fetchPage(cursor: string | null, signal: AbortSignal): Promise<SyncPage<TRaw>>;
  normalize(records: readonly TRaw[]): Promise<TNormalized[]>;
}

export interface ConnectorPolicy {
  concurrency: number;
  minimumDelayMs: number;
  maximumAttempts: number;
}
