import { ipcMain } from 'electron';
import { ipcChannels } from '../../../shared/ipc-channels';
import type { LhbDetailInput, LhbQueryInput } from '../../../shared/longhubang/types';
import { assertTrustedSender } from '../shared';
import type { IpcHandlerContext } from '../types';

export function registerLonghubangHandlers({ window, service }: IpcHandlerContext): void {
  ipcMain.handle(ipcChannels.longhubangStatus, (event, input: { refresh?: boolean }) => {
    assertTrustedSender(event, window);
    return service.request('longhubang.status', input);
  });
  ipcMain.handle(ipcChannels.longhubangQuery, (event, input: LhbQueryInput) => {
    assertTrustedSender(event, window);
    return service.request('longhubang.query', input);
  });
  ipcMain.handle(ipcChannels.longhubangDetail, (event, input: LhbDetailInput) => {
    assertTrustedSender(event, window);
    return service.request('longhubang.detail', input);
  });
}
