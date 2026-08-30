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

export function registerWorkspaceHandlers({ window, service, updater }: IpcHandlerContext): void {
  ipcMain.handle(ipcChannels.health, async (event) => {
    assertTrustedSender(event, window);
    return service.request('system.health', {});
  });

  ipcMain.handle(ipcChannels.openExternal, async (event, input: { url: string }) => {
    assertTrustedSender(event, window);
    const url = input.url.trim();
    if (!/^https?:\/\//iu.test(url)) {
      throw new Error('仅支持打开 http/https 链接');
    }
    await shell.openExternal(url);
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

}
