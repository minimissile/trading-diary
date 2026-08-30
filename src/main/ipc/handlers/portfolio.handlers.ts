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

export function registerPortfolioHandlers({ window, service, updater }: IpcHandlerContext): void {
  ipcMain.handle(ipcChannels.portfolioListPositions, (event, input: { accountId?: string }) => {
    assertTrustedSender(event, window);
    return service.request('portfolio.listPositions', input);
  });

  ipcMain.handle(ipcChannels.portfolioGetSummary, (event, input: { accountId?: string; year?: number }) => {
    assertTrustedSender(event, window);
    return service.request('portfolio.getSummary', input);
  });

  ipcMain.handle(
    ipcChannels.portfolioGetDividendCalendar,
    (event, input: { accountId?: string; month: string }) => {
      assertTrustedSender(event, window);
      return service.request('portfolio.getDividendCalendar', input);
    },
  );

  ipcMain.handle(
    ipcChannels.portfolioListDividends,
    (event, input: { accountId?: string; year?: number; statuses?: ('estimated' | 'confirmed' | 'rejected')[] }) => {
      assertTrustedSender(event, window);
      return service.request('portfolio.listDividends', input);
    },
  );

  ipcMain.handle(ipcChannels.portfolioAddLedgerEntry, (event, input: Record<string, unknown>) => {
    assertTrustedSender(event, window);
    return service.request('portfolio.addLedgerEntry', input as never);
  });

  ipcMain.handle(
    ipcChannels.portfolioListLedgerEntries,
    (event, input: { accountId?: string; symbol?: string }) => {
      assertTrustedSender(event, window);
      return service.request('portfolio.listLedgerEntries', input);
    },
  );

  ipcMain.handle(
    ipcChannels.portfolioGetRealizedHistory,
    (event, input: { accountId?: string; year?: number }) => {
      assertTrustedSender(event, window);
      return service.request('portfolio.getRealizedHistory', input);
    },
  );

  ipcMain.handle(
    ipcChannels.portfolioGetPnlCalendar,
    (event, input: { accountId?: string; month?: string }) => {
      assertTrustedSender(event, window);
      return service.request('portfolio.getPnlCalendar', input);
    },
  );

  ipcMain.handle(ipcChannels.portfolioSyncPnlCalendarBars, (event, input: { accountId?: string }) => {
    assertTrustedSender(event, window);
    return service.request('portfolio.syncPnlCalendarBars', input);
  });

  ipcMain.handle(
    ipcChannels.portfolioSyncPnlCalendarBar,
    (event, input: { accountId?: string; symbol: string }) => {
      assertTrustedSender(event, window);
      return service.request('portfolio.syncPnlCalendarBar', input);
    },
  );

  ipcMain.handle(
    ipcChannels.portfolioUpdateLedgerEntry,
    (event, input: { id: string; input: Record<string, unknown> }) => {
      assertTrustedSender(event, window);
      return service.request('portfolio.updateLedgerEntry', input as never);
    },
  );

  ipcMain.handle(ipcChannels.portfolioDeleteLedgerEntry, (event, input: { id: string }) => {
    assertTrustedSender(event, window);
    return service.request('portfolio.deleteLedgerEntry', input);
  });

  ipcMain.handle(
    ipcChannels.portfolioDeletePosition,
    (event, input: { accountId?: string; symbol: string }) => {
      assertTrustedSender(event, window);
      return service.request('portfolio.deletePosition', input);
    },
  );

  ipcMain.handle(
    ipcChannels.portfolioConfirmDividend,
    (event, input: { id: string; confirmed: boolean; cashAmount?: number; accountId?: string; year?: number }) => {
      assertTrustedSender(event, window);
      return service.request('portfolio.confirmDividend', input);
    },
  );

  ipcMain.handle(
    ipcChannels.portfolioRefreshDividends,
    (event, input: { accountId?: string; symbol?: string }) => {
      assertTrustedSender(event, window);
      return service.request('portfolio.refreshDividends', input);
    },
  );

  ipcMain.handle(ipcChannels.portfolioSyncMarketQuotes, (event, input: { accountId?: string }) => {
    assertTrustedSender(event, window);
    return service.request('portfolio.syncMarketQuotes', input);
  });

  ipcMain.handle(ipcChannels.portfolioGetDividendGoal, (event, input: { accountId?: string }) => {
    assertTrustedSender(event, window);
    return service.request('portfolio.getDividendGoal', input);
  });

  ipcMain.handle(
    ipcChannels.portfolioSaveDividendGoal,
    (event, input: { accountId?: string; settings: import('../shared/portfolio/dividend-goal').DividendGoalSettings | null }) => {
      assertTrustedSender(event, window);
      return service.request('portfolio.saveDividendGoal', input);
    },
  );

}
