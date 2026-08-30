import { app, dialog, ipcMain, shell } from 'electron';
import type {
  CreateTradeAlertInput,
  CreateTradeReviewInput,
  CreateTradingPlanInput,
  LlmUserSettings,
  ReviewAiDraftInput,
  TradeAlertStatus,
  TradingPlanStatus,
} from '../../../shared/api.types';
import type { CreateTradingAccountInput, FeeEstimateInput, UpdateTradingAccountInput } from '../../../shared/accounts/types';
import type { CreateExecutionInput } from '../../../shared/episodes/types';
import type { ExecutionImportInput } from '../../../shared/import/types';
import type { AlertEventUserAction } from '../../../shared/alerts/event-types';
import type {
  CreatePlaybookRuleInput,
  PlaybookRuleStatus,
  UpdatePlaybookRuleInput,
} from '../../../shared/playbook/types';
import type { KLineAdjust, KLinePeriod } from '../../../shared/market/types';
import { ipcChannels } from '../../../shared/ipc-channels';
import type { IpcHandlerContext } from '../types';
import { assertDevOnly, assertTrustedSender, activeStreamCancels, sendStreamEvent } from '../shared';
import { notifyDueSipOccurrences, notifyTriggeredAlerts } from '../notifications';

export function registerMarketHandlers({ window, service, updater }: IpcHandlerContext): void {
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

  ipcMain.handle(
    ipcChannels.marketListDividends,
    (event, input: { symbol: string; page?: number; pageSize?: number }) => {
      assertTrustedSender(event, window);
      return service.request('market.listDividends', input);
    },
  );

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
