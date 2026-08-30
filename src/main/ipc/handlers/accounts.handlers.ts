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

export function registerAccountsHandlers({ window, service, updater }: IpcHandlerContext): void {
  ipcMain.handle(ipcChannels.licenseGetStatus, (event) => {
    assertTrustedSender(event, window);
    return service.request('license.getStatus', {});
  });

  ipcMain.handle(ipcChannels.licenseActivate, (event, input: { code: string }) => {
    assertTrustedSender(event, window);
    return service.request('license.activate', input);
  });

  ipcMain.handle(ipcChannels.accountsList, (event, input: { includeArchived?: boolean }) => {
    assertTrustedSender(event, window);
    return service.request('accounts.list', input);
  });

  ipcMain.handle(ipcChannels.accountsGet, (event, input: { id: string }) => {
    assertTrustedSender(event, window);
    return service.request('accounts.get', input);
  });

  ipcMain.handle(ipcChannels.accountsCreate, (event, input: CreateTradingAccountInput) => {
    assertTrustedSender(event, window);
    return service.request('accounts.create', input);
  });

  ipcMain.handle(
    ipcChannels.accountsUpdate,
    (event, input: { id: string; input: UpdateTradingAccountInput }) => {
      assertTrustedSender(event, window);
      return service.request('accounts.update', input);
    },
  );

  ipcMain.handle(ipcChannels.accountsSetDefault, (event, input: { id: string }) => {
    assertTrustedSender(event, window);
    return service.request('accounts.setDefault', input);
  });

  ipcMain.handle(ipcChannels.accountsArchive, (event, input: { id: string }) => {
    assertTrustedSender(event, window);
    return service.request('accounts.archive', input);
  });

  ipcMain.handle(ipcChannels.accountsDelete, (event, input: { id: string }) => {
    assertTrustedSender(event, window);
    return service.request('accounts.delete', input);
  });

  ipcMain.handle(ipcChannels.accountsListFeeProfiles, (event) => {
    assertTrustedSender(event, window);
    return service.request('accounts.listFeeProfiles', {});
  });

  ipcMain.handle(ipcChannels.accountsEstimateFees, (event, input: FeeEstimateInput) => {
    assertTrustedSender(event, window);
    return service.request('accounts.estimateFees', input);
  });

  ipcMain.handle(
    ipcChannels.accountsEstimateFeesForSymbol,
    (
      event,
      input: {
        accountId?: string;
        feeProfileId?: string;
        side: 'buy' | 'sell';
        symbol: string;
        price: number;
        quantity: number;
      },
    ) => {
      assertTrustedSender(event, window);
      return service.request('accounts.estimateFeesForSymbol', input);
    },
  );

  ipcMain.handle(ipcChannels.backupExport, async (event, input?: { includeLicense?: boolean }) => {
    assertTrustedSender(event, window);
    const stamp = new Date().toISOString().slice(0, 10);
    const selection = await dialog.showSaveDialog(window, {
      title: '导出本地数据',
      defaultPath: `交易日记备份-${stamp}.zip`,
      filters: [{ name: '交易日记备份', extensions: ['zip'] }],
    });
    if (selection.canceled || !selection.filePath) return null;
    let targetPath = selection.filePath;
    if (!targetPath.toLowerCase().endsWith('.zip')) {
      targetPath = `${targetPath}.zip`;
    }
    return service.request('backup.export', {
      targetPath,
      includeLicense: input?.includeLicense,
    });
  });

  ipcMain.handle(ipcChannels.backupImport, async (event) => {
    assertTrustedSender(event, window);
    const selection = await dialog.showOpenDialog(window, {
      title: '导入本地数据',
      properties: ['openFile'],
      filters: [{ name: '交易日记备份', extensions: ['zip'] }],
    });
    const sourcePath = selection.filePaths[0];
    if (selection.canceled || !sourcePath) return null;
    return service.request('backup.import', { sourcePath });
  });

  ipcMain.handle(ipcChannels.backupRelaunchApp, (event) => {
    assertTrustedSender(event, window);
    app.relaunch();
    app.exit(0);
  });

  ipcMain.handle(ipcChannels.episodesList, (event, input?: { accountId?: string }) => {
    assertTrustedSender(event, window);
    return service.request('episodes.list', input ?? {});
  });

  ipcMain.handle(ipcChannels.episodesGet, (event, input: { id: string }) => {
    assertTrustedSender(event, window);
    return service.request('episodes.get', input);
  });

  ipcMain.handle(ipcChannels.episodesAddExecution, (event, input: CreateExecutionInput) => {
    assertTrustedSender(event, window);
    return service.request('episodes.addExecution', input);
  });

  ipcMain.handle(ipcChannels.importSelectCsv, async (event) => {
    assertTrustedSender(event, window);
    const selection = await dialog.showOpenDialog(window, {
      title: '选择成交 CSV 文件',
      properties: ['openFile'],
      filters: [{ name: 'CSV 文件', extensions: ['csv', 'txt'] }],
    });
    const sourcePath = selection.filePaths[0];
    if (selection.canceled || !sourcePath) return null;
    return service.request('import.parseCsv', { sourcePath });
  });

  ipcMain.handle(ipcChannels.importPreviewExecutions, (event, input: ExecutionImportInput) => {
    assertTrustedSender(event, window);
    return service.request('import.previewExecutions', input);
  });

  ipcMain.handle(ipcChannels.importCommitExecutions, (event, input: ExecutionImportInput) => {
    assertTrustedSender(event, window);
    return service.request('import.commitExecutions', input);
  });

  ipcMain.handle(ipcChannels.playbookList, (event, input?: { status?: PlaybookRuleStatus }) => {
    assertTrustedSender(event, window);
    return service.request('playbook.list', input ?? {});
  });

  ipcMain.handle(ipcChannels.playbookCreate, (event, input: CreatePlaybookRuleInput) => {
    assertTrustedSender(event, window);
    return service.request('playbook.create', input);
  });

  ipcMain.handle(ipcChannels.playbookUpdate, (event, input: { id: string; input: UpdatePlaybookRuleInput }) => {
    assertTrustedSender(event, window);
    return service.request('playbook.update', input);
  });

  ipcMain.handle(ipcChannels.playbookArchive, (event, input: { id: string }) => {
    assertTrustedSender(event, window);
    return service.request('playbook.archive', input);
  });

  ipcMain.handle(ipcChannels.playbookActivationChecklist, (event, input?: { symbol?: string }) => {
    assertTrustedSender(event, window);
    return service.request('playbook.activationChecklist', input ?? {});
  });

  ipcMain.handle(ipcChannels.alertsListEvents, (event, input?: { limit?: number }) => {
    assertTrustedSender(event, window);
    return service.request('alerts.listEvents', input ?? {});
  });

  ipcMain.handle(ipcChannels.alertsSetEventAction, (event, input: { id: string; action: AlertEventUserAction }) => {
    assertTrustedSender(event, window);
    return service.request('alerts.setEventAction', input);
  });

  ipcMain.handle(ipcChannels.alertsPollActive, async (event) => {
    assertTrustedSender(event, window);
    const result = await service.request('alerts.pollActive', {});
    notifyTriggeredAlerts(window, result.newlyTriggered);
    return result;
  });

}
