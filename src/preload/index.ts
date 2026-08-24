import { contextBridge, ipcRenderer } from 'electron';
import { ipcChannels, type DesktopApi, type UpdateState } from '../shared/contracts';

const desktopApi: DesktopApi = {
  system: {
    health: () => ipcRenderer.invoke(ipcChannels.health),
  },
  assets: {
    stats: () => ipcRenderer.invoke(ipcChannels.assetStats),
    importImage: () => ipcRenderer.invoke(ipcChannels.importImage),
  },
  updater: {
    getState: () => ipcRenderer.invoke(ipcChannels.getUpdateState),
    check: () => ipcRenderer.invoke(ipcChannels.checkForUpdates),
    download: () => ipcRenderer.invoke(ipcChannels.downloadUpdate),
    install: () => ipcRenderer.invoke(ipcChannels.installUpdate),
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
