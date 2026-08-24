export const ipcChannels = {
  health: 'desktop:health',
  assetStats: 'desktop:assets:stats',
  importImage: 'desktop:assets:import-image',
  updateState: 'desktop:update:state',
  getUpdateState: 'desktop:update:get-state',
  checkForUpdates: 'desktop:update:check',
  downloadUpdate: 'desktop:update:download',
  installUpdate: 'desktop:update:install',
} as const;
