import { ipcMain } from 'electron';
import { ipcChannels } from '../../../shared/ipc-channels';
import type { QuantSettings } from '../../../shared/quant-research/types';
import type { ResearchKind, ResearchRequest } from '../../../shared/quant-research/workbench';
import { assertTrustedSender } from '../shared';
import type { IpcHandlerContext } from '../types';

export function registerQuantResearchHandlers({ window, service }: IpcHandlerContext): void {
  ipcMain.handle(ipcChannels.quantResearchToolState, (event, input: { kind: ResearchKind }) => {
    assertTrustedSender(event, window);
    return service.request('quantResearch.toolState', input);
  });
  ipcMain.handle(ipcChannels.quantResearchToolSave, (event, input: ResearchRequest) => {
    assertTrustedSender(event, window);
    return service.request('quantResearch.toolSave', input);
  });
  ipcMain.handle(ipcChannels.quantResearchToolRun, (event, input: ResearchRequest) => {
    assertTrustedSender(event, window);
    return service.request('quantResearch.toolRun', input);
  });
  ipcMain.handle(ipcChannels.quantResearchReport, (event, input: { id: string }) => {
    assertTrustedSender(event, window);
    return service.request('quantResearch.report', input);
  });
  ipcMain.handle(ipcChannels.quantResearchState, (event) => {
    assertTrustedSender(event, window);
    return service.request('quantResearch.state', {});
  });
  ipcMain.handle(ipcChannels.quantResearchSave, (event, input: QuantSettings) => {
    assertTrustedSender(event, window);
    return service.request('quantResearch.save', input);
  });
  ipcMain.handle(ipcChannels.quantResearchScan, (event, input: QuantSettings) => {
    assertTrustedSender(event, window);
    return service.request('quantResearch.scan', input);
  });
  ipcMain.handle(ipcChannels.quantResearchRun, (event, input: { id: string }) => {
    assertTrustedSender(event, window);
    return service.request('quantResearch.run', input);
  });
}
