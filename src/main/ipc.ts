import { app, dialog, ipcMain, Notification, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
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
import { ipcChannels } from '../shared/ipc-channels';
import type { ServiceHost } from './service-host';
import type { UpdateManager } from './updater/update-manager';

const activeStreamCancels = new Map<string, () => void>();

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
    if (Notification.isSupported()) {
      for (const alert of result.newlyTriggered) {
        const notification = new Notification({
          title: `${alert.symbol} · 提醒已触发`,
          body: `${alert.title}｜最新价 ${result.price}，目标价 ${alert.targetPrice}`,
        });
        notification.on('click', () => {
          if (window.isMinimized()) window.restore();
          window.show();
          window.focus();
        });
        notification.show();
      }
    }
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

  ipcMain.handle(ipcChannels.watchlistListPools, (event) => {
    assertTrustedSender(event, window);
    return service.request('watchlist.listPools', {});
  });

  ipcMain.handle(ipcChannels.watchlistGetPoolSnapshot, (event, input: { poolId: 'dividend' | 'growth' | 'overlap' }) => {
    assertTrustedSender(event, window);
    return service.request('watchlist.getPoolSnapshot', input);
  });

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
    unsubscribeUpdater();
    for (const streamId of [...activeStreamCancels.keys()]) {
      activeStreamCancels.get(streamId)?.();
      activeStreamCancels.delete(streamId);
    }
    ipcMain.removeHandler(ipcChannels.health);
    ipcMain.removeHandler(ipcChannels.assetStats);
    ipcMain.removeHandler(ipcChannels.importImage);
    ipcMain.removeHandler(ipcChannels.workspaceSnapshot);
    ipcMain.removeHandler(ipcChannels.listPlans);
    ipcMain.removeHandler(ipcChannels.createPlan);
    ipcMain.removeHandler(ipcChannels.setPlanStatus);
    ipcMain.removeHandler(ipcChannels.listAlerts);
    ipcMain.removeHandler(ipcChannels.createAlert);
    ipcMain.removeHandler(ipcChannels.setAlertStatus);
    ipcMain.removeHandler(ipcChannels.evaluateAlertPrice);
    ipcMain.removeHandler(ipcChannels.listReviews);
    ipcMain.removeHandler(ipcChannels.createReview);
    ipcMain.removeHandler(ipcChannels.generateReviewAiDraft);
    ipcMain.removeHandler(ipcChannels.startReviewAiDraftStream);
    ipcMain.removeHandler(ipcChannels.getLlmStatus);
    ipcMain.removeHandler(ipcChannels.saveLlmApiKey);
    ipcMain.removeHandler(ipcChannels.testLlmConnection);
    ipcMain.removeHandler(ipcChannels.getLlmUsage);
    ipcMain.removeHandler(ipcChannels.getLlmSettings);
    ipcMain.removeHandler(ipcChannels.saveLlmSettings);
    ipcMain.removeHandler(ipcChannels.previewLlmPrompt);
    ipcMain.removeHandler(ipcChannels.startLlmDebugStream);
    ipcMain.removeHandler(ipcChannels.cancelLlmStream);
    ipcMain.removeHandler(ipcChannels.marketResolve);
    ipcMain.removeHandler(ipcChannels.marketSearch);
    ipcMain.removeHandler(ipcChannels.marketGetQuote);
    ipcMain.removeHandler(ipcChannels.marketGetQuotes);
    ipcMain.removeHandler(ipcChannels.marketGetSnapshot);
    ipcMain.removeHandler(ipcChannels.marketListDividends);
    ipcMain.removeHandler(ipcChannels.marketListNews);
    ipcMain.removeHandler(ipcChannels.watchlistListPools);
    ipcMain.removeHandler(ipcChannels.watchlistGetPoolSnapshot);
    ipcMain.removeHandler(ipcChannels.getUpdateState);
    ipcMain.removeHandler(ipcChannels.checkForUpdates);
    ipcMain.removeHandler(ipcChannels.downloadUpdate);
    ipcMain.removeHandler(ipcChannels.installUpdate);
    ipcMain.removeHandler(ipcChannels.openUpdateRelease);
  };
}
