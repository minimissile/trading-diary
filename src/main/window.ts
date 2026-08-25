import path from 'node:path';
import { BrowserWindow } from 'electron';

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 760,
    minHeight: 520,
    show: false,
    backgroundColor: '#061521',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.once('ready-to-show', () => {
    window.maximize();
    window.show();
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (process.env.ELECTRON_RENDERER_URL) {
    const developmentOrigin = new URL(process.env.ELECTRON_RENDERER_URL).origin;
    window.webContents.on('will-navigate', (event, url) => {
      if (new URL(url).origin !== developmentOrigin) event.preventDefault();
    });
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    window.webContents.on('will-navigate', (event, url) => {
      const destination = new URL(url);
      if (destination.protocol !== 'app:' || destination.hostname !== 'renderer') {
        event.preventDefault();
      }
    });
    void window.loadURL('app://renderer/index.html');
  }

  if (process.env.ELECTRON_OPEN_DEVTOOLS === '1') {
    window.webContents.openDevTools({ mode: 'detach' });
  }

  return window;
}
