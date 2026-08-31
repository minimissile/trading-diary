import { ipcMain } from 'electron';
import { ipcChannels } from '../../../shared/ipc-channels';
import type { CreateLofArbitrageRuleInput, LofArbitrageRuleStatus } from '../../../shared/lof-arbitrage/types';
import type { IpcHandlerContext } from '../types';
import { assertTrustedSender } from '../shared';
import { notifyLofArbitrageAlerts } from '../notifications';

export function registerLofArbitrageHandlers({ window, service }: IpcHandlerContext): void {
  ipcMain.handle(ipcChannels.lofArbitrageListWatchItems, (event) => {
    assertTrustedSender(event, window);
    return service.request('lofArbitrage.listWatchItems', {});
  });

  ipcMain.handle(
    ipcChannels.lofArbitrageAddWatchItem,
    async (event, input: { symbol: string; notes?: string | null }) => {
      assertTrustedSender(event, window);
      const result = await service.request('lofArbitrage.addWatchItem', input);
      if (!window.isDestroyed()) window.webContents.send(ipcChannels.workspaceChanged);
      return result;
    },
  );

  ipcMain.handle(ipcChannels.lofArbitrageRemoveWatchItem, async (event, input: { id: string }) => {
    assertTrustedSender(event, window);
    const result = await service.request('lofArbitrage.removeWatchItem', input);
    if (!window.isDestroyed()) window.webContents.send(ipcChannels.workspaceChanged);
    return result;
  });

  ipcMain.handle(ipcChannels.lofArbitrageListRules, (event) => {
    assertTrustedSender(event, window);
    return service.request('lofArbitrage.listRules', {});
  });

  ipcMain.handle(ipcChannels.lofArbitrageCreateRule, async (event, input: CreateLofArbitrageRuleInput) => {
    assertTrustedSender(event, window);
    const result = await service.request('lofArbitrage.createRule', input);
    if (!window.isDestroyed()) window.webContents.send(ipcChannels.workspaceChanged);
    return result;
  });

  ipcMain.handle(
    ipcChannels.lofArbitrageSetRuleStatus,
    async (event, input: { id: string; status: LofArbitrageRuleStatus }) => {
      assertTrustedSender(event, window);
      const result = await service.request('lofArbitrage.setRuleStatus', input);
      if (!window.isDestroyed()) window.webContents.send(ipcChannels.workspaceChanged);
      return result;
    },
  );

  ipcMain.handle(ipcChannels.lofArbitrageDeleteRule, async (event, input: { id: string }) => {
    assertTrustedSender(event, window);
    const result = await service.request('lofArbitrage.deleteRule', input);
    if (!window.isDestroyed()) window.webContents.send(ipcChannels.workspaceChanged);
    return result;
  });

  ipcMain.handle(ipcChannels.lofArbitrageGetSnapshot, (event, input: { symbol: string }) => {
    assertTrustedSender(event, window);
    return service.request('lofArbitrage.getSnapshot', input);
  });

  ipcMain.handle(ipcChannels.lofArbitrageRefreshMonitor, (event) => {
    assertTrustedSender(event, window);
    return service.request('lofArbitrage.refreshMonitor', {});
  });

  ipcMain.handle(ipcChannels.lofArbitrageScanMarket, (event, input?: { limit?: number }) => {
    assertTrustedSender(event, window);
    return service.request('lofArbitrage.scanMarket', input ?? {});
  });

  ipcMain.handle(ipcChannels.lofArbitrageListEvents, (event, input?: { limit?: number }) => {
    assertTrustedSender(event, window);
    return service.request('lofArbitrage.listEvents', input ?? {});
  });

  ipcMain.handle(
    ipcChannels.lofArbitrageSetEventAction,
    async (event, input: { id: string; action: 'acknowledged' | 'dismissed' }) => {
      assertTrustedSender(event, window);
      const result = await service.request('lofArbitrage.setEventAction', input);
      if (!window.isDestroyed()) window.webContents.send(ipcChannels.workspaceChanged);
      return result;
    },
  );

  ipcMain.handle(ipcChannels.lofArbitragePollActive, async (event) => {
    assertTrustedSender(event, window);
    const result = await service.request('lofArbitrage.pollActive', {});
    notifyLofArbitrageAlerts(window, result.newlyTriggered);
    return result;
  });
}
