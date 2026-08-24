import { contextBridge, ipcRenderer } from 'electron';
import { ipcChannels, type DesktopApi } from '../shared/contracts';

const desktopApi: DesktopApi = {
  system: {
    health: () => ipcRenderer.invoke(ipcChannels.health),
  },
  assets: {
    stats: () => ipcRenderer.invoke(ipcChannels.assetStats),
    importImage: () => ipcRenderer.invoke(ipcChannels.importImage),
  },
};

contextBridge.exposeInMainWorld('desktop', desktopApi);
