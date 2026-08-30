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

export function registerUpdaterHandlers({ window, service, updater }: IpcHandlerContext): void {
  ipcMain.handle(ipcChannels.getUpdateState, (event) => {
    assertTrustedSender(event, window);
    return updater.getState();
  });

  ipcMain.handle(ipcChannels.checkForUpdates, (event) => {
    assertTrustedSender(event, window);
    return updater.check();
  });

  ipcMain.handle(ipcChannels.downloadUpdate, (event) => {
    assertTrustedSender(event, window);
    return updater.download();
  });

  ipcMain.handle(ipcChannels.installUpdate, (event) => {
    assertTrustedSender(event, window);
    updater.install();
  });

  ipcMain.handle(ipcChannels.openUpdateRelease, (event) => {
    assertTrustedSender(event, window);
    return updater.openReleasePage();
  });
}
