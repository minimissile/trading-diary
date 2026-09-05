import { ipcMain } from 'electron';
import { ipcChannels } from '../../../shared/ipc-channels';
import { assertTrustedSender } from '../shared';
import type { IpcHandlerContext } from '../types';

export function registerUpdaterHandlers({ window, updater }: IpcHandlerContext): void {
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
