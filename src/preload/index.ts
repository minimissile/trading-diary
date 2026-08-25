import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi, UpdateState } from '../shared/api.types';
import { ipcChannels } from '../shared/ipc-channels';

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
