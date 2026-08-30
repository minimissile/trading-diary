import type {
  CreateTradingAccountInput,
  FeeEstimateInput,
  FeeEstimateResult,
  FeeProfile,
  TradingAccount,
  TradingAccountSummary,
  UpdateTradingAccountInput,
} from '../../shared/accounts/types';
import {
  normalizeCreateAccountInput,
  normalizeUpdateAccountInput,
} from '../../shared/accounts/account-input';
import type { AccountDatabase } from './account-database';
import { estimateTradeFees } from './fee-calculator';
import type { PortfolioService } from '../portfolio/portfolio-service';
import { marketService } from '../market/market-service';

/**
 * 账户管理业务服务。
 */
export class AccountService {
  constructor(
    private readonly accounts: AccountDatabase,
    private readonly portfolioService: PortfolioService,
  ) {}

  async list(includeArchived = false): Promise<TradingAccountSummary[]> {
    const items = this.accounts.listAccounts(includeArchived);
    return Promise.all(items.map((account) => this.withSummary(account)));
  }

  async get(id: string): Promise<TradingAccountSummary> {
    return this.withSummary(this.accounts.getAccount(id));
  }

  async create(input: CreateTradingAccountInput): Promise<TradingAccountSummary> {
    return this.withSummary(this.accounts.createAccount(normalizeCreateAccountInput(input)));
  }

  async update(id: string, input: UpdateTradingAccountInput): Promise<TradingAccountSummary> {
    return this.withSummary(this.accounts.updateAccount(id, normalizeUpdateAccountInput(input)));
  }

  async setDefault(id: string): Promise<TradingAccountSummary> {
    return this.withSummary(this.accounts.setDefaultAccount(id));
  }

  async archive(id: string): Promise<TradingAccountSummary> {
    return this.withSummary(this.accounts.archiveAccount(id));
  }

  /** 永久删除已归档账户及其关联数据。 */
  async delete(id: string): Promise<void> {
    this.accounts.deleteAccount(id);
  }

  listFeeProfiles(): FeeProfile[] {
    return this.accounts.listFeeProfiles();
  }

  estimateFees(input: FeeEstimateInput): FeeEstimateResult {
    const profile = this.resolveFeeProfile(input);
    return estimateTradeFees(
      {
        side: input.side,
        market: input.market,
        price: input.price,
        quantity: input.quantity,
        instrumentKind: input.instrumentKind,
      },
      profile,
    );
  }

  /** 根据账户、方向与成交信息估算费用。 */
  async estimateFeesForSymbol(input: {
    accountId?: string;
    feeProfileId?: string;
    side: 'buy' | 'sell';
    symbol: string;
    price: number;
    quantity: number;
  }): Promise<FeeEstimateResult> {
    const profile = this.resolveFeeProfile(input);
    let market: FeeEstimateInput['market'];
    let instrumentKind: FeeEstimateInput['instrumentKind'];
    try {
      const resolved = await marketService.resolve(input.symbol);
      market =
        resolved.venue === 'HK' || resolved.venue === 'US'
          ? resolved.venue
          : resolved.market;
      instrumentKind = resolved.kind;
    } catch {
      market = input.symbol.startsWith('6') ? 'SH' : 'SZ';
    }
    return estimateTradeFees(
      {
        side: input.side,
        market,
        price: input.price,
        quantity: input.quantity,
        instrumentKind,
      },
      profile,
    );
  }

  private resolveFeeProfile(input: { accountId?: string; feeProfileId?: string }) {
    if (input.feeProfileId) return this.accounts.getFeeProfileRates(input.feeProfileId);
    if (input.accountId) {
      const account = this.accounts.getAccount(input.accountId);
      if (!account.feeProfileId) throw new Error('账户未绑定费率模板');
      return this.accounts.getFeeProfileRates(account.feeProfileId);
    }
    return this.accounts.getFeeProfileRates(this.accounts.getDefaultAccount().feeProfileId!);
  }

  private async withSummary(account: TradingAccount): Promise<TradingAccountSummary> {
    const stats = this.accounts.getAccountLedgerStats(account.id);
    const feeRatio =
      stats.totalTurnover > 0 ? Math.round((stats.totalFees / stats.totalTurnover) * 10_000) / 10_000 : null;

    const positions = await this.portfolioService.listPositions(account.id);
    const totalMarketValue = positions.reduce((sum, item) => sum + (item.marketValue ?? 0), 0);
    const totalCost = positions.reduce((sum, item) => sum + item.avgCost * item.quantity, 0);
    const unrealizedPnl = positions.reduce((sum, item) => sum + (item.unrealizedPnl ?? 0), 0);

    return {
      ...account,
      totalFees: stats.totalFees,
      totalTurnover: stats.totalTurnover,
      feeRatio,
      positionCount: stats.positionCount,
      ledgerCount: stats.ledgerCount,
      totalMarketValue,
      totalCost,
      unrealizedPnl,
    };
  }
}
