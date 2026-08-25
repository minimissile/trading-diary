import { dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { ipcChannels } from '../shared/ipc-channels';
import type { ServiceHost } from './service-host';
import type { UpdateManager } from './updater/update-manager';

function assertTrustedSender(event: IpcMainInvokeEvent, window: BrowserWindow): void {
  if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
    throw new Error('已拒绝来自非受信 frame 的 IPC 调用');
  }
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

  const unsubscribeUpdater = updater.subscribe((state) => {
    if (!window.isDestroyed()) window.webContents.send(ipcChannels.updateState, state);
  });

  return () => {
    unsubscribeUpdater();
    ipcMain.removeHandler(ipcChannels.health);
    ipcMain.removeHandler(ipcChannels.assetStats);
    ipcMain.removeHandler(ipcChannels.importImage);
    ipcMain.removeHandler(ipcChannels.getUpdateState);
    ipcMain.removeHandler(ipcChannels.checkForUpdates);
    ipcMain.removeHandler(ipcChannels.downloadUpdate);
    ipcMain.removeHandler(ipcChannels.installUpdate);
  };
}
