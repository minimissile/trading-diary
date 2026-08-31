import { queryClient } from '../query-client';
import { queryKeys } from './keys';

/** IPC / 本地写操作后失效工作台相关缓存。 */
export async function invalidateWorkspaceData(): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.workspace.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.sip.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.plans.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.watchlist.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.lofArbitrage.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.home.all }),
  ]);
}

export async function invalidateAccounts(): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all });
}

export async function invalidatePortfolio(accountId?: string, year?: number): Promise<void> {
  if (accountId !== undefined && year !== undefined) {
    await queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.dashboard(accountId, year) });
    return;
  }
  await queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.all });
}

export async function invalidateSip(): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: queryKeys.sip.all });
}

export async function invalidateAlerts(): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all });
}

export async function invalidatePlans(): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: queryKeys.plans.all });
}

export async function invalidatePlaybook(): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: queryKeys.playbook.all });
}

export async function invalidateReviews(): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: queryKeys.reviews.all });
}

export async function invalidateEpisodes(accountId?: string): Promise<void> {
  if (accountId) {
    await queryClient.invalidateQueries({ queryKey: queryKeys.episodes.list(accountId) });
    return;
  }
  await queryClient.invalidateQueries({ queryKey: queryKeys.episodes.all });
}

export async function invalidateWatchlist(): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: queryKeys.watchlist.all });
}

export async function invalidateLofArbitrage(): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: queryKeys.lofArbitrage.all });
}
