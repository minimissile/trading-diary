import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import { APP_NAME } from '../shared/brand';
import { resolveWindowIconPath } from './app-branding';

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 760,
    minHeight: 520,
    show: false,
    title: APP_NAME,
    backgroundColor: '#061521',
    icon: resolveWindowIconPath(),
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
    const devUrl = process.env.ELECTRON_RENDERER_URL.includes('#')
      ? process.env.ELECTRON_RENDERER_URL
      : `${process.env.ELECTRON_RENDERER_URL.replace(/\/?$/, '')}/#/`;

    window.webContents.on('did-fail-load', (_event, code, description, url) => {
      console.error('[renderer] did-fail-load', code, description, url);
    });
    window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      const prefix = level === 3 ? 'error' : level === 2 ? 'warn' : 'log';
      console.log(`[renderer:${prefix}]`, message, sourceId ? `${sourceId}:${line}` : '');
    });

    window.webContents.on('will-navigate', (event, url) => {
      if (new URL(url).origin !== developmentOrigin) event.preventDefault();
    });
    void window.loadURL(devUrl);

    if (process.env.ELECTRON_OPEN_DEVTOOLS === '1' || !app.isPackaged) {
      window.webContents.openDevTools({ mode: 'detach' });
    }
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
