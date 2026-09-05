import { app, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import type { LlmStreamPayload } from '../../shared/api.types';
import { ipcChannels } from '../../shared/ipc-channels';

/** 仅用于 webContents.send 的通道，不是 ipcMain.handle 目标。 */
export const IPC_PUSH_CHANNELS = new Set<string>([
  ipcChannels.workspaceChanged,
  ipcChannels.reminderTriggered,
  ipcChannels.updateState,
  ipcChannels.llmStreamEvent,
]);

export const activeStreamCancels = new Map<string, () => void>();

export function assertTrustedSender(event: IpcMainInvokeEvent, window: BrowserWindow): void {
  if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
    throw new Error('已拒绝来自非受信 frame 的 IPC 调用');
  }
}

export function assertDevOnly(): void {
  if (app.isPackaged) throw new Error('该功能仅在开发模式可用');
}

export function sendStreamEvent(window: BrowserWindow, payload: LlmStreamPayload): void {
  if (!window.isDestroyed()) window.webContents.send(ipcChannels.llmStreamEvent, payload);
}
