import type { SipPlanStatus } from '../../../shared/sip/types';
import { dialog, ipcMain } from 'electron';
import path from 'node:path';
import { ipcChannels } from '../../../shared/ipc-channels';
import { assertTrustedSender } from '../shared';
import type { IpcHandlerContext } from '../types';

export function registerSipHandlers({ window, service }: IpcHandlerContext): void {
  ipcMain.handle(ipcChannels.sipListPlans, (event, input?: { statuses?: SipPlanStatus[] }) => {
    assertTrustedSender(event, window);
    return service.request('sip.listPlans', input ?? {});
  });

  ipcMain.handle(ipcChannels.sipGetPlan, (event, input: { id: string }) => {
    assertTrustedSender(event, window);
    return service.request('sip.getPlan', input);
  });

  ipcMain.handle(ipcChannels.sipCreatePlan, (event, input: Record<string, unknown>) => {
    assertTrustedSender(event, window);
    return service.request('sip.createPlan', input as never);
  });

  ipcMain.handle(ipcChannels.sipUpdatePlan, (event, input: { id: string; input: Record<string, unknown> }) => {
    assertTrustedSender(event, window);
    return service.request('sip.updatePlan', input);
  });

  ipcMain.handle(ipcChannels.sipSetStatus, (event, input: { id: string; status: string }) => {
    assertTrustedSender(event, window);
    return service.request('sip.setStatus', input as never);
  });

  ipcMain.handle(ipcChannels.sipDeletePlan, async (event, input: { id: string }) => {
    assertTrustedSender(event, window);
    const result = await service.request('sip.deletePlan', input);
    if (!window.isDestroyed()) window.webContents.send(ipcChannels.workspaceChanged);
    return result;
  });

  ipcMain.handle(ipcChannels.sipSchedulePause, async (event, input: { id: string; fromDate: string }) => {
    assertTrustedSender(event, window);
    const result = await service.request('sip.schedulePause', input);
    if (!window.isDestroyed()) window.webContents.send(ipcChannels.workspaceChanged);
    return result;
  });

  ipcMain.handle(ipcChannels.sipCancelScheduledPause, async (event, input: { id: string }) => {
    assertTrustedSender(event, window);
    const result = await service.request('sip.cancelScheduledPause', input);
    if (!window.isDestroyed()) window.webContents.send(ipcChannels.workspaceChanged);
    return result;
  });

  ipcMain.handle(ipcChannels.sipPreviewSchedule, (event, input: Record<string, unknown>) => {
    assertTrustedSender(event, window);
    return service.request('sip.previewSchedule', input as never);
  });

  ipcMain.handle(ipcChannels.sipListOccurrences, (event, input?: { planId?: string; from?: string; to?: string }) => {
    assertTrustedSender(event, window);
    return service.request('sip.listOccurrences', input ?? {});
  });

  ipcMain.handle(ipcChannels.sipListOccurrenceViews, (event, input?: { planId?: string; from?: string; to?: string }) => {
    assertTrustedSender(event, window);
    return service.request('sip.listOccurrenceViews', input ?? {});
  });

  ipcMain.handle(ipcChannels.sipConfirmOccurrence, async (event, input: Record<string, unknown>) => {
    assertTrustedSender(event, window);
    const result = await service.request('sip.confirmOccurrence', input as never);
    if (!window.isDestroyed()) window.webContents.send(ipcChannels.workspaceChanged);
    return result;
  });

  ipcMain.handle(ipcChannels.sipSkipOccurrence, async (event, input: { id: string; reason: string }) => {
    assertTrustedSender(event, window);
    const result = await service.request('sip.skipOccurrence', input);
    if (!window.isDestroyed()) window.webContents.send(ipcChannels.workspaceChanged);
    return result;
  });

  ipcMain.handle(ipcChannels.sipGetSummary, (event) => {
    assertTrustedSender(event, window);
    return service.request('sip.getSummary', {});
  });

  ipcMain.handle(ipcChannels.sipScanDue, (event) => {
    assertTrustedSender(event, window);
    return service.request('sip.scanDue', {});
  });

  ipcMain.handle(ipcChannels.sipGetOccurrenceCalendar, (event, input: { month: string }) => {
    assertTrustedSender(event, window);
    return service.request('sip.getOccurrenceCalendar', input);
  });

  ipcMain.handle(ipcChannels.sipGetPositionMeta, (event, input?: { accountId?: string }) => {
    assertTrustedSender(event, window);
    return service.request('sip.getPositionMeta', input ?? {});
  });

  ipcMain.handle(ipcChannels.sipGetReviewTemplate, (event, input: { planId: string }) => {
    assertTrustedSender(event, window);
    return service.request('sip.getReviewTemplate', input);
  });

  ipcMain.handle(ipcChannels.sipGetPlanPositionLink, (event, input: { planId: string }) => {
    assertTrustedSender(event, window);
    return service.request('sip.getPlanPositionLink', input);
  });

  ipcMain.handle(ipcChannels.sipListPlansBySymbol, (event, input: { accountId: string; symbol: string }) => {
    assertTrustedSender(event, window);
    return service.request('sip.listPlansBySymbol', input);
  });

  ipcMain.handle(ipcChannels.sipParseImportCsv, (event, input: { sourcePath: string }) => {
    assertTrustedSender(event, window);
    return service.request('sip.parseImportCsv', input);
  });

  ipcMain.handle(ipcChannels.sipPreviewImport, (event, input: Record<string, unknown>) => {
    assertTrustedSender(event, window);
    return service.request('sip.previewImport', input as never);
  });

  ipcMain.handle(ipcChannels.sipCommitImport, async (event, input: Record<string, unknown>) => {
    assertTrustedSender(event, window);
    const result = await service.request('sip.commitImport', input as never);
    if (!window.isDestroyed()) window.webContents.send(ipcChannels.workspaceChanged);
    return result;
  });

  ipcMain.handle(ipcChannels.sipSelectImportScreenshot, async (event) => {
    assertTrustedSender(event, window);
    const selection = await dialog.showOpenDialog(window, {
      title: '选择定投记录截图',
      properties: ['openFile'],
      filters: [{ name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
    });
    const sourcePath = selection.filePaths[0];
    if (selection.canceled || !sourcePath) return null;
    return { sourcePath, fileName: path.basename(sourcePath) };
  });

  ipcMain.handle(ipcChannels.sipRecognizeImportScreenshot, (event, input: { sourcePath: string }) => {
    assertTrustedSender(event, window);
    return service.request('sip.recognizeImportScreenshot', input);
  });

  ipcMain.handle(ipcChannels.sipPreviewAiImport, (event, input: Record<string, unknown>) => {
    assertTrustedSender(event, window);
    return service.request('sip.previewAiImport', input as never);
  });

  ipcMain.handle(ipcChannels.sipCommitAiImport, async (event, input: Record<string, unknown>) => {
    assertTrustedSender(event, window);
    const result = await service.request('sip.commitAiImport', input as never);
    if (!window.isDestroyed()) window.webContents.send(ipcChannels.workspaceChanged);
    return result;
  });
}
