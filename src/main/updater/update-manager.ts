import fs from 'node:fs';
import path from 'node:path';
import { app, shell } from 'electron';
import electronUpdater, {
  type AppUpdater,
  type ProgressInfo,
  type UpdateDownloadedEvent,
  type UpdateInfo,
} from 'electron-updater';
import type { UpdateState } from '../../shared/api.types';
import { getReleasePageUrl, getUpdateDeliveryMode } from './update-policy';

const STARTUP_CHECK_DELAY_MS = 10_000;
const { autoUpdater } = electronUpdater;

type StateListener = (state: UpdateState) => void;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '客户端更新发生未知错误';
}

/**
 * 管理跨平台更新生命周期，并向 IPC 层提供与框架无关的更新状态。
 * macOS 只检查版本并打开 GitHub Release，Windows 执行应用内下载和安装。
 * 开发环境或未写入 app-update.yml 的本地包会保持禁用，不会访问网络。
 */
export class UpdateManager {
  private readonly updater: AppUpdater;
  private readonly deliveryMode = getUpdateDeliveryMode(process.platform);
  private readonly listeners = new Set<StateListener>();
  private state: UpdateState;
  private enabled = false;
  private started = false;
  private startupTimer: NodeJS.Timeout | null = null;
  private checkPromise: Promise<UpdateState> | null = null;
  private downloadPromise: Promise<UpdateState> | null = null;

  constructor(updater: AppUpdater = autoUpdater) {
    this.updater = updater;
    this.state = {
      phase: 'disabled',
      deliveryMode: this.deliveryMode,
      currentVersion: app.getVersion(),
      availableVersion: null,
      downloadPercent: null,
      message: '客户端更新尚未初始化',
    };
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    if (!app.isPackaged) {
      this.setState({ phase: 'disabled', message: '开发环境不启用自动更新' });
      return;
    }

    const updateConfigPath = path.join(process.resourcesPath, 'app-update.yml');
    if (!fs.existsSync(updateConfigPath)) {
      this.setState({ phase: 'disabled', message: '当前安装包未配置 GitHub 更新源' });
      return;
    }

    this.enabled = true;
    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = false;
    this.registerUpdaterEvents();
    this.setState({
      phase: 'idle',
      message:
        this.deliveryMode === 'manual'
          ? '更新检查已就绪；macOS 新版本通过 GitHub Releases 手动安装'
          : '自动更新已就绪（GitHub Releases）',
    });

    this.startupTimer = setTimeout(() => {
      void this.check().catch((error: unknown) => {
        console.warn('启动时检查更新失败', error);
      });
    }, STARTUP_CHECK_DELAY_MS);
  }

  stop(): void {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    this.startupTimer = null;
    this.listeners.clear();
  }

  getState(): UpdateState {
    return { ...this.state };
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  check(): Promise<UpdateState> {
    if (!this.enabled) return Promise.resolve(this.getState());
    if (this.checkPromise) return this.checkPromise;

    this.checkPromise = this.performCheck().finally(() => {
      this.checkPromise = null;
    });
    return this.checkPromise;
  }

  download(): Promise<UpdateState> {
    if (!this.enabled) return Promise.resolve(this.getState());
    if (this.deliveryMode === 'manual') {
      return Promise.reject(new Error('macOS 使用 GitHub Releases 手动更新，不支持应用内下载'));
    }
    if (this.downloadPromise) return this.downloadPromise;
    if (this.state.phase !== 'available') {
      return Promise.reject(new Error('当前没有可下载的新版本'));
    }

    this.downloadPromise = this.performDownload().finally(() => {
      this.downloadPromise = null;
    });
    return this.downloadPromise;
  }

  install(): void {
    if (this.deliveryMode === 'manual') {
      throw new Error('macOS 使用 GitHub Releases 手动更新，不支持应用内安装');
    }
    if (this.state.phase !== 'downloaded') {
      throw new Error('更新尚未下载完成');
    }

    // v6 API：非静默安装，Windows 安装完成后强制重新启动应用。
    this.updater.quitAndInstall(false, true);
  }

  async openReleasePage(): Promise<void> {
    if (this.deliveryMode !== 'manual') {
      throw new Error('当前平台使用应用内自动更新');
    }
    if (this.state.phase !== 'available' || !this.state.availableVersion) {
      throw new Error('当前没有可手动安装的新版本');
    }

    await shell.openExternal(getReleasePageUrl(this.state.availableVersion));
  }

  private async performCheck(): Promise<UpdateState> {
    try {
      await this.updater.checkForUpdates();
      return this.getState();
    } catch (error) {
      this.setError(error);
      throw error;
    }
  }

  private async performDownload(): Promise<UpdateState> {
    try {
      this.setState({
        phase: 'downloading',
        downloadPercent: 0,
        message: '正在下载更新',
      });
      await this.updater.downloadUpdate();
      return this.getState();
    } catch (error) {
      this.setError(error);
      throw error;
    }
  }

  private registerUpdaterEvents(): void {
    this.updater.on('checking-for-update', () => {
      this.setState({
        phase: 'checking',
        availableVersion: null,
        downloadPercent: null,
        message: '正在检查更新',
      });
    });

    this.updater.on('update-available', (info: UpdateInfo) => {
      this.setState({
        phase: 'available',
        availableVersion: info.version,
        downloadPercent: null,
        message:
          this.deliveryMode === 'manual'
            ? `发现新版本 ${info.version}，请前往 GitHub Releases 下载 DMG 手动安装`
            : `发现新版本 ${info.version}`,
      });
    });

    this.updater.on('update-not-available', () => {
      this.setState({
        phase: 'not-available',
        availableVersion: null,
        downloadPercent: null,
        message: '当前已是最新版本',
      });
    });

    this.updater.on('download-progress', (progress: ProgressInfo) => {
      const percent = Math.max(0, Math.min(100, progress.percent));
      this.setState({
        phase: 'downloading',
        downloadPercent: percent,
        message: `正在下载更新 ${percent.toFixed(1)}%`,
      });
    });

    this.updater.on('update-downloaded', (info: UpdateDownloadedEvent) => {
      this.setState({
        phase: 'downloaded',
        availableVersion: info.version,
        downloadPercent: 100,
        message: `版本 ${info.version} 已下载，可立即安装`,
      });
    });

    this.updater.on('error', (error: Error) => {
      this.setError(error);
    });
  }

  private setError(error: unknown): void {
    this.setState({
      phase: 'error',
      downloadPercent: null,
      message: `客户端更新失败：${errorMessage(error)}`,
    });
  }

  private setState(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch };
    const snapshot = this.getState();
    for (const listener of this.listeners) listener(snapshot);
  }
}
