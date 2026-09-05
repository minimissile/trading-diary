import { app, ipcMain, safeStorage } from 'electron';
import { AiSelectionStore } from '../../../service/strategy/ai-selection-store';
import { ipcChannels } from '../../../shared/ipc-channels';
import type { AiSelectionQuery, AiSelectionSettings, SelectionPlatform } from '../../../shared/strategy/ai-selection';
import { assertTrustedSender } from '../shared';
import type { IpcHandlerContext } from '../types';

export function registerAiSelectionHandlers({ window }: IpcHandlerContext): void {
  // Keep encrypted credentials in the main process; never return them to the renderer.
  let store: AiSelectionStore | undefined;
  const getStore = (): AiSelectionStore =>
    (store ??= new AiSelectionStore(app.getPath('userData'), {
      available: () =>
        safeStorage.isEncryptionAvailable() &&
        (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text'),
      encrypt: (value) => safeStorage.encryptString(value),
      decrypt: (value) => safeStorage.decryptString(value),
    }));
  ipcMain.handle(ipcChannels.aiSelectionState, (event) => {
    assertTrustedSender(event, window);
    return getStore().getState();
  });
  ipcMain.handle(ipcChannels.aiSelectionSave, (event, input: AiSelectionSettings) => {
    assertTrustedSender(event, window);
    return getStore().saveSettings(input);
  });
  ipcMain.handle(ipcChannels.aiSelectionSaveKey, (event, input: { platform: SelectionPlatform; apiKey: string }) => {
    assertTrustedSender(event, window);
    return getStore().saveKey(input);
  });
  ipcMain.handle(ipcChannels.aiSelectionClearKey, (event, input: SelectionPlatform) => {
    assertTrustedSender(event, window);
    return getStore().clearKey(input);
  });
  ipcMain.handle(ipcChannels.aiSelectionQuery, (event, input: AiSelectionQuery) => {
    assertTrustedSender(event, window);
    return getStore().query(input);
  });
}
