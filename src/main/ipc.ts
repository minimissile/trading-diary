import { app, dialog, ipcMain, Notification, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import type {
  CreateTradeAlertInput,
  CreateTradeReviewInput,
  CreateTradingPlanInput,
  LlmStreamPayload,
  LlmUserSettings,
  ReviewAiDraftInput,
  TradeAlertStatus,
  TradingPlanStatus,
} from '../shared/api.types';
import type { CreateTradingAccountInput, FeeEstimateInput, UpdateTradingAccountInput } from '../shared/accounts/types';
import type { CreateExecutionInput } from '../shared/episodes/types';
import type { ExecutionImportInput } from '../shared/import/types';
import type { AlertEvent, AlertEventUserAction } from '../shared/alerts/event-types';
import type {
  CreatePlaybookRuleInput,
  PlaybookRuleStatus,
  UpdatePlaybookRuleInput,
} from '../shared/playbook/types';
import type { KLineAdjust, KLinePeriod } from '../shared/market/types';
import type { FundSipOccurrenceView } from '../shared/sip/types';
import type { ServiceHost } from './service-host';
import type { UpdateManager } from './updater/update-manager';
import { ipcChannels } from '../shared/ipc-channels';

/** 仅用于 webContents.send 的通道，不是 ipcMain.handle 目标。 */
const IPC_PUSH_CHANNELS = new Set<string>([
  ipcChannels.workspaceChanged,
  ipcChannels.updateState,
  ipcChannels.llmStreamEvent,
]);

const activeStreamCancels = new Map<string, () => void>();
const ALERT_POLL_INTERVAL_MS = 60_000;

function notifyTriggeredAlerts(window: BrowserWindow, events: readonly AlertEvent[]): void {
  if (events.length === 0) return;

  if (Notification.isSupported()) {
    for (const event of events) {
      const notification = new Notification({
        title: `${event.symbol} · 提醒已触发`,
        body: `${event.title}｜触发价 ${event.triggerPrice}，目标价 ${event.targetPrice}`,
      });
      notification.on('click', () => {
        if (window.isMinimized()) window.restore();
        window.show();
        window.focus();
      });
      notification.show();
    }
  }

  if (!window.isDestroyed()) {
    window.webContents.send(ipcChannels.workspaceChanged);
  }
}

function notifyDueSipOccurrences(window: BrowserWindow, occurrences: readonly FundSipOccurrenceView[]): void {
  if (occurrences.length === 0) return;

  if (Notification.isSupported()) {
    for (const occurrence of occurrences) {
      const notification = new Notification({
        title: `${occurrence.symbol} · 定投待确认`,
        body: `${occurrence.planName}｜计划扣款 ¥${occurrence.plannedAmount.toFixed(2)} · ${occurrence.scheduledDate}`,
      });
      notification.on('click', () => {
        if (window.isMinimized()) window.restore();
        window.show();
        window.focus();
      });
      notification.show();
    }
  }

  if (!window.isDestroyed()) {
    window.webContents.send(ipcChannels.workspaceChanged);
  }
}

function assertTrustedSender(event: IpcMainInvokeEvent, window: BrowserWindow): void {
  if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
    throw new Error('已拒绝来自非受信 frame 的 IPC 调用');
  }
}

function assertDevOnly(): void {
  if (app.isPackaged) throw new Error('该功能仅在开发模式可用');
}

function sendStreamEvent(window: BrowserWindow, payload: LlmStreamPayload): void {
  if (!window.isDestroyed()) window.webContents.send(ipcChannels.llmStreamEvent, payload);
}

/**
 * 注册 IPC 处理程序。
 * @param window 主窗口
 * @param service 服务主机
 * @param updater 更新管理器
 */
export function registerIpcHandlers(window: BrowserWindow, service: ServiceHost, updater: UpdateManager): () => void {
  ipcMain.handle(ipcChannels.health, async (event) => {
    assertTrustedSender(event, window);
    return service.request('system.health', {});
  });

  ipcMain.handle(ipcChannels.assetStats, async (event) => {
    assertTrustedSender(event, window);
    return service.request('assets.stats', {});
  });

  ipcMain.handle(ipcChannels.importImage, async (event) => {
    assertTrustedSender(event, window);
    const selection = await dialog.showOpenDialog(window, {
      title: '导入图片',
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'tif', 'tiff', 'avif'] }],
    });

    const sourcePath = selection.filePaths[0];
    if (selection.canceled || !sourcePath) return null;
    return service.request('assets.import', { sourcePath });
  });

  ipcMain.handle(ipcChannels.workspaceSnapshot, (event) => {
    assertTrustedSender(event, window);
    return service.request('workspace.snapshot', {});
  });

  ipcMain.handle(ipcChannels.listPlans, (event) => {
    assertTrustedSender(event, window);
    return service.request('plans.list', {});
  });

  ipcMain.handle(ipcChannels.createPlan, (event, input: CreateTradingPlanInput) => {
    assertTrustedSender(event, window);
    return service.request('plans.create', input);
  });

  ipcMain.handle(ipcChannels.setPlanStatus, (event, input: { id: string; status: TradingPlanStatus }) => {
    assertTrustedSender(event, window);
    return service.request('plans.setStatus', input);
  });

  ipcMain.handle(ipcChannels.listAlerts, (event) => {
    assertTrustedSender(event, window);
    return service.request('alerts.list', {});
  });

  ipcMain.handle(ipcChannels.createAlert, (event, input: CreateTradeAlertInput) => {
    assertTrustedSender(event, window);
    return service.request('alerts.create', input);
  });

  ipcMain.handle(ipcChannels.setAlertStatus, (event, input: { id: string; status: TradeAlertStatus }) => {
    assertTrustedSender(event, window);
    return service.request('alerts.setStatus', input);
  });

  ipcMain.handle(ipcChannels.evaluateAlertPrice, async (event, input: { symbol: string; price: number }) => {
    assertTrustedSender(event, window);
    const result = await service.request('alerts.evaluatePrice', input);
    notifyTriggeredAlerts(window, result.newlyTriggeredEvents);
    return result;
  });

  ipcMain.handle(ipcChannels.listReviews, (event) => {
    assertTrustedSender(event, window);
    return service.request('reviews.list', {});
  });

  ipcMain.handle(ipcChannels.createReview, (event, input: CreateTradeReviewInput) => {
    assertTrustedSender(event, window);
    return service.request('reviews.create', input);
  });

  ipcMain.handle(ipcChannels.generateReviewAiDraft, (event, input: ReviewAiDraftInput) => {
    assertTrustedSender(event, window);
    return service.request('reviews.generateAiDraft', input);
  });

  ipcMain.handle(ipcChannels.startReviewAiDraftStream, (event, input: { streamId: string; payload: ReviewAiDraftInput }) => {
    assertTrustedSender(event, window);
    const session = service.startStream('reviews.generateAiDraftStream', input.payload, input.streamId, {
      onChunk: (delta) => sendStreamEvent(window, { streamId: input.streamId, type: 'chunk', delta }),
      onDone: (result) => {
        activeStreamCancels.delete(input.streamId);
        sendStreamEvent(window, { streamId: input.streamId, type: 'done', result });
      },
      onError: (error) => {
        activeStreamCancels.delete(input.streamId);
        sendStreamEvent(window, { streamId: input.streamId, type: 'error', code: error.code, message: error.message });
      },
    });
    activeStreamCancels.set(input.streamId, session.cancel);
    return { streamId: input.streamId };
  });

  ipcMain.handle(ipcChannels.getLlmStatus, (event) => {
    assertTrustedSender(event, window);
    return service.request('settings.getLlmStatus', {});
  });

  ipcMain.handle(ipcChannels.saveLlmApiKey, (event, input: { apiKey: string }) => {
    assertTrustedSender(event, window);
    return service.request('settings.saveLlmApiKey', input);
  });

  ipcMain.handle(ipcChannels.testLlmConnection, (event) => {
    assertTrustedSender(event, window);
    return service.request('settings.testLlmConnection', {});
  });

  ipcMain.handle(ipcChannels.getLlmUsage, (event) => {
    assertTrustedSender(event, window);
    return service.request('settings.getLlmUsage', {});
  });

  ipcMain.handle(ipcChannels.getLlmSettings, (event) => {
    assertTrustedSender(event, window);
    return service.request('settings.getLlmSettings', {});
  });

  ipcMain.handle(ipcChannels.saveLlmSettings, (event, settings: LlmUserSettings) => {
    assertTrustedSender(event, window);
    return service.request('settings.saveLlmSettings', settings);
  });

  ipcMain.handle(ipcChannels.getAccessLock, (event) => {
    assertTrustedSender(event, window);
    return service.request('settings.getAccessLock', {});
  });

  ipcMain.handle(ipcChannels.verifyAccessLock, (event, input: { password: string }) => {
    assertTrustedSender(event, window);
    return service.request('settings.verifyAccessLock', input);
  });

  ipcMain.handle(ipcChannels.enableAccessLock, (event, input: { newPassword: string }) => {
    assertTrustedSender(event, window);
    return service.request('settings.enableAccessLock', input);
  });

  ipcMain.handle(ipcChannels.enableExistingAccessLock, (event) => {
    assertTrustedSender(event, window);
    return service.request('settings.enableExistingAccessLock', {});
  });

  ipcMain.handle(ipcChannels.disableAccessLock, (event, input: { password: string }) => {
    assertTrustedSender(event, window);
    return service.request('settings.disableAccessLock', input);
  });

  ipcMain.handle(ipcChannels.changeAccessLockPassword, (event, input: { currentPassword: string; newPassword: string }) => {
    assertTrustedSender(event, window);
    return service.request('settings.changeAccessLockPassword', input);
  });

  ipcMain.handle(
    ipcChannels.previewLlmPrompt,
    (event, input: { promptId: string; variables: Record<string, string> }) => {
      assertTrustedSender(event, window);
      assertDevOnly();
      return service.request('llm.previewPrompt', input as never);
    },
  );

  ipcMain.handle(
    ipcChannels.startLlmDebugStream,
    (event, input: { streamId: string; promptId: string; variables: Record<string, string> }) => {
      assertTrustedSender(event, window);
      assertDevOnly();
      const session = service.startStream(
        'llm.debugRunStream',
        { promptId: input.promptId, variables: input.variables } as never,
        input.streamId,
        {
          onChunk: (delta) => sendStreamEvent(window, { streamId: input.streamId, type: 'chunk', delta }),
          onDone: (result) => {
            activeStreamCancels.delete(input.streamId);
            sendStreamEvent(window, { streamId: input.streamId, type: 'done', result });
          },
          onError: (error) => {
            activeStreamCancels.delete(input.streamId);
            sendStreamEvent(window, { streamId: input.streamId, type: 'error', code: error.code, message: error.message });
          },
        },
      );
      activeStreamCancels.set(input.streamId, session.cancel);
      return { streamId: input.streamId };
    },
  );

  ipcMain.handle(ipcChannels.cancelLlmStream, (event, input: { streamId: string }) => {
    assertTrustedSender(event, window);
    activeStreamCancels.get(input.streamId)?.();
    activeStreamCancels.delete(input.streamId);
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

  ipcMain.handle(ipcChannels.sipListPlans, (event, input?: { statuses?: import('../shared/sip/types').SipPlanStatus[] }) => {
    assertTrustedSender(event, window);
    return service.request('sip.listPlans', input ?? {});
  });

  ipcMain.handle(ipcChannels.sipGetPlan, (event, input: { id: string }) => {
    assertTrustedSender(event, window);
    return service.request('sip.getPlan', input);
  });

  ipcMain.handle(ipcChannels.sipCreatePlan, (event, input: Record<string, unknown>) => {
    assertTrustedSender(event, window);
    return service.request('sip.createPlan', input as never);
  });

  ipcMain.handle(ipcChannels.sipUpdatePlan, (event, input: { id: string; input: Record<string, unknown> }) => {
    assertTrustedSender(event, window);
    return service.request('sip.updatePlan', input as never);
  });

  ipcMain.handle(ipcChannels.sipSetStatus, (event, input: { id: string; status: string }) => {
    assertTrustedSender(event, window);
    return service.request('sip.setStatus', input as never);
  });

  ipcMain.handle(ipcChannels.sipPreviewSchedule, (event, input: Record<string, unknown>) => {
    assertTrustedSender(event, window);
    return service.request('sip.previewSchedule', input as never);
  });

  ipcMain.handle(
    ipcChannels.sipListOccurrences,
    (event, input?: { planId?: string; from?: string; to?: string }) => {
      assertTrustedSender(event, window);
      return service.request('sip.listOccurrences', input ?? {});
    },
  );

  ipcMain.handle(
    ipcChannels.sipListOccurrenceViews,
    (event, input?: { planId?: string; from?: string; to?: string }) => {
      assertTrustedSender(event, window);
      return service.request('sip.listOccurrenceViews', input ?? {});
    },
  );

  ipcMain.handle(ipcChannels.sipConfirmOccurrence, async (event, input: Record<string, unknown>) => {
    assertTrustedSender(event, window);
    const result = await service.request('sip.confirmOccurrence', input as never);
    if (!window.isDestroyed()) window.webContents.send(ipcChannels.workspaceChanged);
    return result;
  });

  ipcMain.handle(ipcChannels.sipSkipOccurrence, async (event, input: { id: string; reason: string }) => {
    assertTrustedSender(event, window);
    const result = await service.request('sip.skipOccurrence', input);
    if (!window.isDestroyed()) window.webContents.send(ipcChannels.workspaceChanged);
    return result;
  });

  ipcMain.handle(ipcChannels.sipGetSummary, (event) => {
    assertTrustedSender(event, window);
    return service.request('sip.getSummary', {});
  });

  ipcMain.handle(ipcChannels.sipScanDue, (event) => {
    assertTrustedSender(event, window);
    return service.request('sip.scanDue', {});
  });

  ipcMain.handle(ipcChannels.sipGetOccurrenceCalendar, (event, input: { month: string }) => {
    assertTrustedSender(event, window);
    return service.request('sip.getOccurrenceCalendar', input);
  });

  ipcMain.handle(ipcChannels.sipGetPositionMeta, (event, input?: { accountId?: string }) => {
    assertTrustedSender(event, window);
    return service.request('sip.getPositionMeta', input ?? {});
  });

  ipcMain.handle(ipcChannels.sipGetReviewTemplate, (event, input: { planId: string }) => {
    assertTrustedSender(event, window);
    return service.request('sip.getReviewTemplate', input);
  });

  ipcMain.handle(ipcChannels.sipGetPlanPositionLink, (event, input: { planId: string }) => {
    assertTrustedSender(event, window);
    return service.request('sip.getPlanPositionLink', input);
  });

  ipcMain.handle(
    ipcChannels.sipListPlansBySymbol,
    (event, input: { accountId: string; symbol: string }) => {
      assertTrustedSender(event, window);
      return service.request('sip.listPlansBySymbol', input);
    },
  );

  ipcMain.handle(ipcChannels.sipParseImportCsv, (event, input: { sourcePath: string }) => {
    assertTrustedSender(event, window);
    return service.request('sip.parseImportCsv', input);
  });

  ipcMain.handle(ipcChannels.sipPreviewImport, (event, input: Record<string, unknown>) => {
    assertTrustedSender(event, window);
    return service.request('sip.previewImport', input as never);
  });

  ipcMain.handle(ipcChannels.sipCommitImport, async (event, input: Record<string, unknown>) => {
    assertTrustedSender(event, window);
    const result = await service.request('sip.commitImport', input as never);
    if (!window.isDestroyed()) window.webContents.send(ipcChannels.workspaceChanged);
    return result;
  });

  ipcMain.handle(ipcChannels.sipSelectImportScreenshot, async (event) => {
    assertTrustedSender(event, window);
    const selection = await dialog.showOpenDialog(window, {
      title: '选择定投记录截图',
      properties: ['openFile'],
      filters: [{ name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
    });
    const sourcePath = selection.filePaths[0];
    if (selection.canceled || !sourcePath) return null;
    return { sourcePath, fileName: path.basename(sourcePath) };
  });

  ipcMain.handle(ipcChannels.sipRecognizeImportScreenshot, (event, input: { sourcePath: string }) => {
    assertTrustedSender(event, window);
    return service.request('sip.recognizeImportScreenshot', input);
  });

  ipcMain.handle(ipcChannels.sipPreviewAiImport, (event, input: Record<string, unknown>) => {
    assertTrustedSender(event, window);
    return service.request('sip.previewAiImport', input as never);
  });

  ipcMain.handle(ipcChannels.sipCommitAiImport, async (event, input: Record<string, unknown>) => {
    assertTrustedSender(event, window);
    const result = await service.request('sip.commitAiImport', input as never);
    if (!window.isDestroyed()) window.webContents.send(ipcChannels.workspaceChanged);
    return result;
  });

  const pollBackgroundTasks = (): void => {
    if (window.isDestroyed()) return;
    void service
      .request('alerts.pollActive', {})
      .then((result) => notifyTriggeredAlerts(window, result.newlyTriggered))
      .catch(() => undefined);
    void service
      .request('sip.scanDue', {})
      .then((result) => notifyDueSipOccurrences(window, result.newlyDueOccurrences))
      .catch(() => undefined);
  };

  const alertPollTimer = setInterval(pollBackgroundTasks, ALERT_POLL_INTERVAL_MS);

  pollBackgroundTasks();

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

  const unsubscribeUpdater = updater.subscribe((state) => {
    if (!window.isDestroyed()) window.webContents.send(ipcChannels.updateState, state);
  });

  return () => {
    clearInterval(alertPollTimer);
    unsubscribeUpdater();
    for (const streamId of [...activeStreamCancels.keys()]) {
      activeStreamCancels.get(streamId)?.();
      activeStreamCancels.delete(streamId);
    }
    for (const channel of Object.values(ipcChannels)) {
      if (IPC_PUSH_CHANNELS.has(channel)) continue;
      ipcMain.removeHandler(channel);
    }
  };
}
