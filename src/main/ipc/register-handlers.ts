import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { ipcChannels } from '../../shared/ipc-channels';
import type { ServiceHost } from '../service-host';
import type { UpdateManager } from '../updater/update-manager';
import { registerAccountsHandlers } from './handlers/accounts.handlers';
import { registerMarketHandlers } from './handlers/market.handlers';
import { registerPortfolioHandlers } from './handlers/portfolio.handlers';
import { registerSettingsHandlers } from './handlers/settings.handlers';
import { registerSipHandlers } from './handlers/sip.handlers';
import { registerUpdaterHandlers } from './handlers/updater.handlers';
import { registerWorkspaceHandlers } from './handlers/workspace.handlers';
import { notifyDueSipOccurrences, notifyTriggeredAlerts } from './notifications';
import { activeStreamCancels, IPC_PUSH_CHANNELS } from './shared';

const ALERT_POLL_INTERVAL_MS = 60_000;

export function registerIpcHandlers(window: BrowserWindow, service: ServiceHost, updater: UpdateManager): () => void {
  const context = { window, service, updater };

  registerWorkspaceHandlers(context);
  registerSettingsHandlers(context);
  registerMarketHandlers(context);
  registerPortfolioHandlers(context);
  registerAccountsHandlers(context);
  registerSipHandlers(context);
  registerUpdaterHandlers(context);

  const pollBackgroundTasks = (): void => {
    if (window.isDestroyed()) return;
    void service
      .request('alerts.pollActive', {})
      .then((result) => notifyTriggeredAlerts(window, result.newlyTriggered))
      .catch(() => undefined);
    void service
      .request('sip.scanDue', {})
      .then((result) => notifyDueSipOccurrences(window, result.newlyDueOccurrences))
      .catch(() => undefined);
  };

  const alertPollTimer = setInterval(pollBackgroundTasks, ALERT_POLL_INTERVAL_MS);
  pollBackgroundTasks();

  const unsubscribeUpdater = updater.subscribe((state) => {
    if (!window.isDestroyed()) window.webContents.send(ipcChannels.updateState, state);
  });

  return () => {
    clearInterval(alertPollTimer);
    unsubscribeUpdater();
    for (const streamId of [...activeStreamCancels.keys()]) {
      activeStreamCancels.get(streamId)?.();
      activeStreamCancels.delete(streamId);
    }
    for (const channel of Object.values(ipcChannels)) {
      if (IPC_PUSH_CHANNELS.has(channel)) continue;
      ipcMain.removeHandler(channel);
    }
  };
}
