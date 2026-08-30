import type { BrowserWindow } from 'electron';
import type { ServiceHost } from '../service-host';
import type { UpdateManager } from '../updater/update-manager';

export interface IpcHandlerContext {
  window: BrowserWindow;
  service: ServiceHost;
  updater: UpdateManager;
}
