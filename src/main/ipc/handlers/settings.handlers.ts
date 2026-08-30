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

export function registerSettingsHandlers({ window, service, updater }: IpcHandlerContext): void {
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

}
