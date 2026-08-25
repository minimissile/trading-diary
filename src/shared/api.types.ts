export interface HealthResult {
  servicePid: number;
  startedAt: string;
  sqliteVersion: string;
  schemaVersion: number;
  storageReady: boolean;
}

export interface AssetStats {
  count: number;
  originalBytes: number;
  previewBytes: number;
}

export interface ImportedAsset {
  hash: string;
  mediaType: string;
  width: number | null;
  height: number | null;
  originalBytes: number;
  previewUrl: string;
  duplicate: boolean;
}

export type UpdatePhase =
  'disabled' | 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';

/** 自动更新模块对渲染进程公开的稳定状态，避免暴露 electron-updater 对象。 */
export interface UpdateState {
  phase: UpdatePhase;
  currentVersion: string;
  availableVersion: string | null;
  downloadPercent: number | null;
  message: string | null;
}

export interface DesktopApi {
  system: {
    health: () => Promise<HealthResult>;
  };
  assets: {
    stats: () => Promise<AssetStats>;
    importImage: () => Promise<ImportedAsset | null>;
  };
  updater: {
    getState: () => Promise<UpdateState>;
    check: () => Promise<UpdateState>;
    download: () => Promise<UpdateState>;
    install: () => Promise<void>;
    onStateChanged: (listener: (state: UpdateState) => void) => () => void;
  };
}
