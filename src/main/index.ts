import { app, BrowserWindow, protocol } from 'electron';
import { registerIpcHandlers } from './ipc';
import { registerProtocolHandlers } from './protocols';
import { ServiceHost } from './service-host';
import { UpdateManager } from './updater/update-manager';
import { createMainWindow } from './window';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      codeCache: true,
    },
  },
  {
    scheme: 'app-asset',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
    },
  },
]);

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();

const service = new ServiceHost();
const updater = new UpdateManager();
let mainWindow: BrowserWindow | null = null;
let disposeIpc: (() => void) | null = null;
let disposeProtocols: (() => void) | null = null;

async function bootstrap(): Promise<void> {
  await app.whenReady();
  app.setAppUserModelId('com.tradingdiary.desktop');

  await service.start(app.getPath('userData'));
  disposeProtocols = registerProtocolHandlers(service);

  mainWindow = createMainWindow();
  disposeIpc = registerIpcHandlers(mainWindow, service, updater);
  updater.start();
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createMainWindow();
    disposeIpc?.();
    disposeIpc = registerIpcHandlers(mainWindow, service, updater);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  disposeIpc?.();
  disposeProtocols?.();
  updater.stop();
  service.stop();
});

if (singleInstance) {
  void bootstrap().catch((error: unknown) => {
    console.error('应用启动失败', error);
    app.exit(1);
  });
}
