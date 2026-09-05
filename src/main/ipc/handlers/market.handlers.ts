import { ipcMain } from 'electron';
import { ipcChannels } from '../../../shared/ipc-channels';
import type { KLineAdjust, KLinePeriod } from '../../../shared/market/types';
import { assertTrustedSender } from '../shared';
import type { IpcHandlerContext } from '../types';
import type { PersonalWatchlistMethods } from '../../../shared/watchlist/personal';

export function registerMarketHandlers({ window, service }: IpcHandlerContext): void {
  ipcMain.handle(ipcChannels.watchlistListPersonal, (event) => {
    assertTrustedSender(event, window);
    return service.request('watchlist.listPersonal', {});
  });
  ipcMain.handle(ipcChannels.watchlistAdd, (event, input: PersonalWatchlistMethods['watchlist.add']['params']) => {
    assertTrustedSender(event, window);
    return service.request('watchlist.add', input);
  });
  ipcMain.handle(ipcChannels.watchlistUpdate, (event, input: PersonalWatchlistMethods['watchlist.update']['params']) => {
    assertTrustedSender(event, window);
    return service.request('watchlist.update', input);
  });
  ipcMain.handle(ipcChannels.watchlistRemove, (event, input: PersonalWatchlistMethods['watchlist.remove']['params']) => {
    assertTrustedSender(event, window);
    return service.request('watchlist.remove', input);
  });
  ipcMain.handle(ipcChannels.watchlistMove, (event, input: PersonalWatchlistMethods['watchlist.move']['params']) => {
    assertTrustedSender(event, window);
    return service.request('watchlist.move', input);
  });
  ipcMain.handle(ipcChannels.watchlistSaveGroup, (event, input: PersonalWatchlistMethods['watchlist.saveGroup']['params']) => {
    assertTrustedSender(event, window);
    return service.request('watchlist.saveGroup', input);
  });
  ipcMain.handle(ipcChannels.watchlistRemoveGroup, (event, input: PersonalWatchlistMethods['watchlist.removeGroup']['params']) => {
    assertTrustedSender(event, window);
    return service.request('watchlist.removeGroup', input);
  });
  ipcMain.handle(ipcChannels.watchlistListLogs, (event, input: PersonalWatchlistMethods['watchlist.listLogs']['params']) => {
    assertTrustedSender(event, window);
    return service.request('watchlist.listLogs', input);
  });
  ipcMain.handle(ipcChannels.watchlistSaveLog, (event, input: PersonalWatchlistMethods['watchlist.saveLog']['params']) => {
    assertTrustedSender(event, window);
    return service.request('watchlist.saveLog', input);
  });
  ipcMain.handle(ipcChannels.watchlistRemoveLog, (event, input: PersonalWatchlistMethods['watchlist.removeLog']['params']) => {
    assertTrustedSender(event, window);
    return service.request('watchlist.removeLog', input);
  });
  ipcMain.handle(ipcChannels.watchlistSetReminder, (event, input: PersonalWatchlistMethods['watchlist.setReminder']['params']) => {
    assertTrustedSender(event, window);
    return service.request('watchlist.setReminder', input);
  });
  ipcMain.handle(ipcChannels.marketResolve, (event, input: { symbol: string }) => {
    assertTrustedSender(event, window);
    return service.request('market.resolve', input);
  });

  ipcMain.handle(ipcChannels.marketSearch, (event, input: { query: string; limit?: number }) => {
    assertTrustedSender(event, window);
    return service.request('market.search', input);
  });

  ipcMain.handle(ipcChannels.marketGetQuote, (event, input: { symbol: string }) => {
    assertTrustedSender(event, window);
    return service.request('market.getQuote', input);
  });

  ipcMain.handle(ipcChannels.marketGetQuotes, (event, input: { symbols: string[] }) => {
    assertTrustedSender(event, window);
    return service.request('market.getQuotes', input);
  });

  ipcMain.handle(ipcChannels.marketGetSnapshot, (event, input: { symbol: string }) => {
    assertTrustedSender(event, window);
    return service.request('market.getSnapshot', input);
  });

  ipcMain.handle(ipcChannels.marketListDividends, (event, input: { symbol: string; page?: number; pageSize?: number }) => {
    assertTrustedSender(event, window);
    return service.request('market.listDividends', input);
  });

  ipcMain.handle(ipcChannels.marketListNews, (event, input: { symbol: string; pageSize?: number }) => {
    assertTrustedSender(event, window);
    return service.request('market.listNews', input);
  });

  ipcMain.handle(
    ipcChannels.marketListKlines,
    (
      event,
      input: {
        symbol: string;
        period?: KLinePeriod;
        adjust?: KLineAdjust;
        limit?: number;
        beforeTimestamp?: number;
      },
    ) => {
      assertTrustedSender(event, window);
      return service.request('market.listKlines', input);
    },
  );

  ipcMain.handle(ipcChannels.watchlistListPools, (event) => {
    assertTrustedSender(event, window);
    return service.request('watchlist.listPools', {});
  });

  ipcMain.handle(ipcChannels.watchlistGetPoolSnapshot, (event, input: { poolId: 'dividend' | 'growth' | 'overlap' }) => {
    assertTrustedSender(event, window);
    return service.request('watchlist.getPoolSnapshot', input);
  });
}
