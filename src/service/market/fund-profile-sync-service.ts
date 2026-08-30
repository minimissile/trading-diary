import type { InstrumentKind } from '../../shared/market/types';
import { shouldCacheFundProfile } from '../../shared/market/fund-profile';
import type { FundProfileDatabase } from './fund-profile-database';
import { fetchFundBasicInformation } from './eastmoney/fund-profile-service';
import { normalizeSymbol } from './eastmoney/symbols';

/** 档案过期后后台静默刷新（运作方式/申赎状态可能变化）。 */
export const FUND_PROFILE_STALE_MS = 7 * 24 * 60 * 60 * 1000;

const REQUEST_DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export interface FundProfileSyncResult {
  symbol: string;
  synced: boolean;
  skipped: boolean;
  error?: string;
}

export class FundProfileSyncService {
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly profiles: FundProfileDatabase) {}

  scheduleSymbols(symbols: readonly string[], kinds: ReadonlyMap<string, InstrumentKind>): void {
    const unique = [...new Set(symbols.map((item) => normalizeSymbol(item)).filter(Boolean))];
    const targets = unique.filter((symbol) => shouldCacheFundProfile(kinds.get(symbol) ?? 'otc_fund'));
    if (targets.length === 0) return;

    this.chain = this.chain.then(async () => {
      for (const symbol of targets) {
        const kind = kinds.get(symbol) ?? 'otc_fund';
        try {
          await this.syncSymbol(symbol, kind, { force: false });
        } catch {
          // 后台补拉失败时不阻断其它标的
        }
        await sleep(REQUEST_DELAY_MS);
      }
    });
  }

  async syncSymbol(
    symbolInput: string,
    kind: InstrumentKind,
    options: { force?: boolean } = {},
  ): Promise<FundProfileSyncResult> {
    const symbol = normalizeSymbol(symbolInput);
    if (!shouldCacheFundProfile(kind)) {
      return { symbol, synced: false, skipped: true };
    }

    const existing = this.profiles.get(symbol);
    if (existing && !options.force) {
      const ageMs = Date.now() - new Date(existing.fetchedAt).getTime();
      if (ageMs < FUND_PROFILE_STALE_MS) {
        return { symbol, synced: false, skipped: true };
      }
    }

    try {
      const profile = await fetchFundBasicInformation(symbol);
      this.profiles.upsert(symbol, kind, profile);
      return { symbol, synced: true, skipped: false };
    } catch (error) {
      return {
        symbol,
        synced: false,
        skipped: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export function createFundProfileSyncService(profiles: FundProfileDatabase): FundProfileSyncService {
  return new FundProfileSyncService(profiles);
}
