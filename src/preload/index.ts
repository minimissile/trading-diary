import { randomUUID } from 'node:crypto';
import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi, LlmDebugRunResult, LlmStreamPayload, ReviewAiDraftResult, UpdateState } from '../shared/api.types';
import { ipcChannels } from '../shared/ipc-channels';

function startLlmStream<T>(
  invokeChannel: string,
  invokePayload: Record<string, unknown>,
  listeners: {
    onChunk: (delta: string) => void;
    onDone: (result: T) => void;
    onError: (error: { code: string; message: string }) => void;
  },
): { streamId: string; cancel: () => void } {
  const streamId = randomUUID();
  let settled = false;

  const cleanup = (): void => {
    ipcRenderer.removeListener(ipcChannels.llmStreamEvent, handler);
  };

  const handler = (_event: Electron.IpcRendererEvent, payload: LlmStreamPayload): void => {
    if (payload.streamId !== streamId || settled) return;

    if (payload.type === 'chunk') {
      listeners.onChunk(payload.delta ?? '');
      return;
    }

    settled = true;
    cleanup();

    if (payload.type === 'done') {
      listeners.onDone(payload.result as T);
      return;
    }

    listeners.onError({
      code: payload.code ?? 'SERVICE_ERROR',
      message: payload.message ?? '未知错误',
    });
  };

  ipcRenderer.on(ipcChannels.llmStreamEvent, handler);
  void ipcRenderer.invoke(invokeChannel, { streamId, ...invokePayload });

  return {
    streamId,
    cancel: () => {
      if (settled) return;
      settled = true;
      cleanup();
      void ipcRenderer.invoke(ipcChannels.cancelLlmStream, { streamId });
    },
  };
}

const desktopApi: DesktopApi = {
  system: {
    health: () => ipcRenderer.invoke(ipcChannels.health),
  },
  assets: {
    stats: () => ipcRenderer.invoke(ipcChannels.assetStats),
    importImage: () => ipcRenderer.invoke(ipcChannels.importImage),
  },
  workspace: {
    snapshot: () => ipcRenderer.invoke(ipcChannels.workspaceSnapshot),
  },
  plans: {
    list: () => ipcRenderer.invoke(ipcChannels.listPlans),
    create: (input) => ipcRenderer.invoke(ipcChannels.createPlan, input),
    setStatus: (id, status) => ipcRenderer.invoke(ipcChannels.setPlanStatus, { id, status }),
  },
  alerts: {
    list: () => ipcRenderer.invoke(ipcChannels.listAlerts),
    create: (input) => ipcRenderer.invoke(ipcChannels.createAlert, input),
    setStatus: (id, status) => ipcRenderer.invoke(ipcChannels.setAlertStatus, { id, status }),
    evaluatePrice: (symbol, price) => ipcRenderer.invoke(ipcChannels.evaluateAlertPrice, { symbol, price }),
  },
  reviews: {
    list: () => ipcRenderer.invoke(ipcChannels.listReviews),
    create: (input) => ipcRenderer.invoke(ipcChannels.createReview, input),
    generateAiDraft: (input) => ipcRenderer.invoke(ipcChannels.generateReviewAiDraft, input),
    generateAiDraftStream: (input, listeners) =>
      Promise.resolve(
        startLlmStream<ReviewAiDraftResult>(ipcChannels.startReviewAiDraftStream, { payload: input }, listeners),
      ),
  },
  settings: {
    getLlmStatus: () => ipcRenderer.invoke(ipcChannels.getLlmStatus),
    saveLlmApiKey: (apiKey) => ipcRenderer.invoke(ipcChannels.saveLlmApiKey, { apiKey }),
    testLlmConnection: () => ipcRenderer.invoke(ipcChannels.testLlmConnection),
    getLlmUsage: () => ipcRenderer.invoke(ipcChannels.getLlmUsage),
    getLlmSettings: () => ipcRenderer.invoke(ipcChannels.getLlmSettings),
    saveLlmSettings: (settings) => ipcRenderer.invoke(ipcChannels.saveLlmSettings, settings),
  },
  llm: {
    previewPrompt: (promptId, variables) => ipcRenderer.invoke(ipcChannels.previewLlmPrompt, { promptId, variables }),
    debugRunStream: (promptId, variables, listeners) =>
      Promise.resolve(
        startLlmStream<LlmDebugRunResult>(ipcChannels.startLlmDebugStream, { promptId, variables }, listeners),
      ),
  },
  updater: {
    getState: () => ipcRenderer.invoke(ipcChannels.getUpdateState),
    check: () => ipcRenderer.invoke(ipcChannels.checkForUpdates),
    download: () => ipcRenderer.invoke(ipcChannels.downloadUpdate),
    install: () => ipcRenderer.invoke(ipcChannels.installUpdate),
    openReleasePage: () => ipcRenderer.invoke(ipcChannels.openUpdateRelease),
    onStateChanged: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, state: UpdateState): void => {
        listener(state);
      };

      ipcRenderer.on(ipcChannels.updateState, handler);
      return () => ipcRenderer.removeListener(ipcChannels.updateState, handler);
    },
  },
};

contextBridge.exposeInMainWorld('desktop', desktopApi);
