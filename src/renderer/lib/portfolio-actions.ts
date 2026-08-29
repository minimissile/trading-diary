import type { PortfolioPositionView } from '../../shared/portfolio/types';

function isMissingIpcHandlerError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('No handler registered');
}

/**
 * 删除指定账户下的整笔持仓（全部流水）。
 * 优先走 deletePosition；开发态主进程未热重载时回退为逐条 deleteLedgerEntry。
 */
export async function deletePortfolioPosition(
  accountId: string | undefined,
  symbol: string,
): Promise<PortfolioPositionView[]> {
  const api = window.desktop.portfolio;

  try {
    return await api.deletePosition(accountId, symbol);
  } catch (error) {
    if (!isMissingIpcHandlerError(error)) throw error;
  }

  const entries = await api.listLedgerEntries(accountId, symbol);
  if (entries.length === 0) {
    throw new Error('未找到可删除的持仓流水');
  }

  let positions: PortfolioPositionView[] = [];
  for (const entry of entries) {
    positions = await api.deleteLedgerEntry(entry.id);
  }
  return positions;
}
