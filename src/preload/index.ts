import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi, LlmDebugRunResult, LlmStreamPayload, ReviewAiDraftResult, UpdateState } from '../shared/api.types';
import { ipcChannels } from '../shared/ipc-channels';

function startLlmStream<T>(
  invokeChannel: string,
  invokePayload: Record<string, unknown>,
  listeners: {
    onChunk: (delta: string) => void;
    onDone: (result: T) => void;
    onError: (error: { code: string; message: string }) => void;
  },
): { streamId: string; cancel: () => void } {
  const streamId = crypto.randomUUID();
  let settled = false;

  const cleanup = (): void => {
    ipcRenderer.removeListener(ipcChannels.llmStreamEvent, handler);
  };

  const handler = (_event: Electron.IpcRendererEvent, payload: LlmStreamPayload): void => {
    if (payload.streamId !== streamId || settled) return;

    if (payload.type === 'chunk') {
      listeners.onChunk(payload.delta ?? '');
      return;
    }

    settled = true;
    cleanup();

    if (payload.type === 'done') {
      listeners.onDone(payload.result as T);
      return;
    }

    listeners.onError({
      code: payload.code ?? 'SERVICE_ERROR',
      message: payload.message ?? '未知错误',
    });
  };

  ipcRenderer.on(ipcChannels.llmStreamEvent, handler);
  void ipcRenderer.invoke(invokeChannel, { streamId, ...invokePayload });

  return {
    streamId,
    cancel: () => {
      if (settled) return;
      settled = true;
      cleanup();
      void ipcRenderer.invoke(ipcChannels.cancelLlmStream, { streamId });
    },
  };
}

const desktopApi: DesktopApi = {
  system: {
    health: () => ipcRenderer.invoke(ipcChannels.health),
    openExternal: (url) => ipcRenderer.invoke(ipcChannels.openExternal, { url }),
  },
  assets: {
    stats: () => ipcRenderer.invoke(ipcChannels.assetStats),
    importImage: () => ipcRenderer.invoke(ipcChannels.importImage),
  },
  workspace: {
    snapshot: () => ipcRenderer.invoke(ipcChannels.workspaceSnapshot),
    onChanged: (listener: () => void) => {
      const handler = (): void => listener();
      ipcRenderer.on(ipcChannels.workspaceChanged, handler);
      return () => ipcRenderer.removeListener(ipcChannels.workspaceChanged, handler);
    },
  },
  plans: {
    list: () => ipcRenderer.invoke(ipcChannels.listPlans),
    create: (input) => ipcRenderer.invoke(ipcChannels.createPlan, input),
    setStatus: (id, status) => ipcRenderer.invoke(ipcChannels.setPlanStatus, { id, status }),
  },
  alerts: {
    list: () => ipcRenderer.invoke(ipcChannels.listAlerts),
    create: (input) => ipcRenderer.invoke(ipcChannels.createAlert, input),
    setStatus: (id, status) => ipcRenderer.invoke(ipcChannels.setAlertStatus, { id, status }),
    evaluatePrice: (symbol, price) => ipcRenderer.invoke(ipcChannels.evaluateAlertPrice, { symbol, price }),
    listEvents: (limit) => ipcRenderer.invoke(ipcChannels.alertsListEvents, { limit }),
    setEventAction: (id, action) => ipcRenderer.invoke(ipcChannels.alertsSetEventAction, { id, action }),
  },
  reviews: {
    list: () => ipcRenderer.invoke(ipcChannels.listReviews),
    create: (input) => ipcRenderer.invoke(ipcChannels.createReview, input),
    generateAiDraft: (input) => ipcRenderer.invoke(ipcChannels.generateReviewAiDraft, input),
    generateAiDraftStream: (input, listeners) =>
      Promise.resolve(
        startLlmStream<ReviewAiDraftResult>(ipcChannels.startReviewAiDraftStream, { payload: input }, listeners),
      ),
  },
  settings: {
    getLlmStatus: () => ipcRenderer.invoke(ipcChannels.getLlmStatus),
    saveLlmApiKey: (apiKey) => ipcRenderer.invoke(ipcChannels.saveLlmApiKey, { apiKey }),
    testLlmConnection: () => ipcRenderer.invoke(ipcChannels.testLlmConnection),
    getLlmUsage: () => ipcRenderer.invoke(ipcChannels.getLlmUsage),
    getLlmSettings: () => ipcRenderer.invoke(ipcChannels.getLlmSettings),
    saveLlmSettings: (settings) => ipcRenderer.invoke(ipcChannels.saveLlmSettings, settings),
    getAccessLock: () => ipcRenderer.invoke(ipcChannels.getAccessLock),
    verifyAccessLock: (password) => ipcRenderer.invoke(ipcChannels.verifyAccessLock, { password }),
    enableAccessLock: (newPassword) => ipcRenderer.invoke(ipcChannels.enableAccessLock, { newPassword }),
    enableExistingAccessLock: () => ipcRenderer.invoke(ipcChannels.enableExistingAccessLock),
    disableAccessLock: (password) => ipcRenderer.invoke(ipcChannels.disableAccessLock, { password }),
    changeAccessLockPassword: (currentPassword, newPassword) =>
      ipcRenderer.invoke(ipcChannels.changeAccessLockPassword, { currentPassword, newPassword }),
  },
  llm: {
    previewPrompt: (promptId, variables) => ipcRenderer.invoke(ipcChannels.previewLlmPrompt, { promptId, variables }),
    debugRunStream: (promptId, variables, listeners) =>
      Promise.resolve(
        startLlmStream<LlmDebugRunResult>(ipcChannels.startLlmDebugStream, { promptId, variables }, listeners),
      ),
  },
  updater: {
    getState: () => ipcRenderer.invoke(ipcChannels.getUpdateState),
    check: () => ipcRenderer.invoke(ipcChannels.checkForUpdates),
    download: () => ipcRenderer.invoke(ipcChannels.downloadUpdate),
    install: () => ipcRenderer.invoke(ipcChannels.installUpdate),
    openReleasePage: () => ipcRenderer.invoke(ipcChannels.openUpdateRelease),
    onStateChanged: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, state: UpdateState): void => {
        listener(state);
      };

      ipcRenderer.on(ipcChannels.updateState, handler);
      return () => ipcRenderer.removeListener(ipcChannels.updateState, handler);
    },
  },
  market: {
    resolve: (symbol) => ipcRenderer.invoke(ipcChannels.marketResolve, { symbol }),
    search: (query, limit, marketScopes, assetKind) =>
      ipcRenderer.invoke(ipcChannels.marketSearch, { query, limit, marketScopes, assetKind }),
    getQuote: (symbol) => ipcRenderer.invoke(ipcChannels.marketGetQuote, { symbol }),
    getQuotes: (symbols) => ipcRenderer.invoke(ipcChannels.marketGetQuotes, { symbols }),
    getSnapshot: (symbol) => ipcRenderer.invoke(ipcChannels.marketGetSnapshot, { symbol }),
    listDividends: (symbol, page, pageSize) =>
      ipcRenderer.invoke(ipcChannels.marketListDividends, { symbol, page, pageSize }),
    listNews: (symbol, pageSize) => ipcRenderer.invoke(ipcChannels.marketListNews, { symbol, pageSize }),
    listKlines: (symbol, period, adjust, limit, beforeTimestamp) =>
      ipcRenderer.invoke(ipcChannels.marketListKlines, { symbol, period, adjust, limit, beforeTimestamp }),
  },
  watchlist: {
    listPools: () => ipcRenderer.invoke(ipcChannels.watchlistListPools),
    getPoolSnapshot: (poolId) => ipcRenderer.invoke(ipcChannels.watchlistGetPoolSnapshot, { poolId }),
  },
  tradeSnapshot: {
    cancel: () => ipcRenderer.invoke(ipcChannels.tradeSnapshotCancel),
    open: (input) => ipcRenderer.invoke(ipcChannels.tradeSnapshotOpen, input),
    payload: () => ipcRenderer.invoke(ipcChannels.tradeSnapshotPayload),
    ready: (error) => ipcRenderer.invoke(ipcChannels.tradeSnapshotReady, error),
  },
  portfolio: {
    listPositions: (accountId) => ipcRenderer.invoke(ipcChannels.portfolioListPositions, { accountId }),
    getSummary: (accountId, year) => ipcRenderer.invoke(ipcChannels.portfolioGetSummary, { accountId, year }),
    getDividendCalendar: (accountId, month) =>
      ipcRenderer.invoke(ipcChannels.portfolioGetDividendCalendar, { accountId, month }),
    listDividends: (accountId, year, statuses) =>
      ipcRenderer.invoke(ipcChannels.portfolioListDividends, { accountId, year, statuses }),
    addLedgerEntry: (input) => ipcRenderer.invoke(ipcChannels.portfolioAddLedgerEntry, input),
    listLedgerEntries: (accountId, symbol) =>
      ipcRenderer.invoke(ipcChannels.portfolioListLedgerEntries, { accountId, symbol }),
    getRealizedHistory: (accountId, year) =>
      ipcRenderer.invoke(ipcChannels.portfolioGetRealizedHistory, { accountId, year }),
    getPnlCalendar: (accountId, month) =>
      ipcRenderer.invoke(ipcChannels.portfolioGetPnlCalendar, { accountId, month }),
    syncPnlCalendarBars: (accountId) =>
      ipcRenderer.invoke(ipcChannels.portfolioSyncPnlCalendarBars, { accountId }),
    syncPnlCalendarBar: (accountId, symbol) =>
      ipcRenderer.invoke(ipcChannels.portfolioSyncPnlCalendarBar, { accountId, symbol }),
    updateLedgerEntry: (id, input) => ipcRenderer.invoke(ipcChannels.portfolioUpdateLedgerEntry, { id, input }),
    deleteLedgerEntry: (id) => ipcRenderer.invoke(ipcChannels.portfolioDeleteLedgerEntry, { id }),
    deletePosition: (accountId, symbol) =>
      ipcRenderer.invoke(ipcChannels.portfolioDeletePosition, { accountId, symbol }),
    confirmDividend: (id, confirmed, cashAmount, accountId, year) =>
      ipcRenderer.invoke(ipcChannels.portfolioConfirmDividend, { id, confirmed, cashAmount, accountId, year }),
    refreshDividends: (accountId, symbol) =>
      ipcRenderer.invoke(ipcChannels.portfolioRefreshDividends, { accountId, symbol }),
    syncMarketQuotes: (accountId) => ipcRenderer.invoke(ipcChannels.portfolioSyncMarketQuotes, { accountId }),
    getDividendGoal: (accountId) => ipcRenderer.invoke(ipcChannels.portfolioGetDividendGoal, { accountId }),
    saveDividendGoal: (accountId, settings) =>
      ipcRenderer.invoke(ipcChannels.portfolioSaveDividendGoal, { accountId, settings }),
    getDividendPayoutDefault: (accountId, symbol) =>
      ipcRenderer.invoke(ipcChannels.portfolioGetDividendPayoutDefault, { accountId, symbol }),
    setDividendPayoutMode: (id, payoutMode, setDefault, accountId, year) =>
      ipcRenderer.invoke(ipcChannels.portfolioSetDividendPayoutMode, {
        id,
        payoutMode,
        setDefault,
        accountId,
        year,
      }),
    selectLedgerImportScreenshots: () => ipcRenderer.invoke(ipcChannels.portfolioSelectLedgerImportScreenshots),
    saveLedgerImportPasteImages: (images) =>
      ipcRenderer.invoke(ipcChannels.portfolioSaveLedgerImportPasteImages, { images }),
    readLedgerImportImagePreviews: (sourcePaths) =>
      ipcRenderer.invoke(ipcChannels.portfolioReadLedgerImportImagePreviews, { sourcePaths }),
    recognizeLedgerImportScreenshots: (sourcePaths, importAssetKind) =>
      ipcRenderer.invoke(ipcChannels.portfolioRecognizeLedgerImportScreenshots, {
        sourcePaths,
        importAssetKind,
      }),
    previewLedgerAiImport: (input) => ipcRenderer.invoke(ipcChannels.portfolioPreviewLedgerAiImport, input),
    commitLedgerAiImport: (input) => ipcRenderer.invoke(ipcChannels.portfolioCommitLedgerAiImport, input),
  },
  license: {
    getStatus: () => ipcRenderer.invoke(ipcChannels.licenseGetStatus),
    activate: (code) => ipcRenderer.invoke(ipcChannels.licenseActivate, { code }),
  },
  accounts: {
    list: (includeArchived) => ipcRenderer.invoke(ipcChannels.accountsList, { includeArchived }),
    get: (id) => ipcRenderer.invoke(ipcChannels.accountsGet, { id }),
    create: (input) => ipcRenderer.invoke(ipcChannels.accountsCreate, input),
    update: (id, input) => ipcRenderer.invoke(ipcChannels.accountsUpdate, { id, input }),
    setDefault: (id) => ipcRenderer.invoke(ipcChannels.accountsSetDefault, { id }),
    archive: (id) => ipcRenderer.invoke(ipcChannels.accountsArchive, { id }),
    delete: (id) => ipcRenderer.invoke(ipcChannels.accountsDelete, { id }),
    listFeeProfiles: () => ipcRenderer.invoke(ipcChannels.accountsListFeeProfiles),
    estimateFees: (input) => ipcRenderer.invoke(ipcChannels.accountsEstimateFees, input),
    estimateFeesForSymbol: (input) => ipcRenderer.invoke(ipcChannels.accountsEstimateFeesForSymbol, input),
  },
  backup: {
    export: (options) => ipcRenderer.invoke(ipcChannels.backupExport, options),
    import: () => ipcRenderer.invoke(ipcChannels.backupImport),
    relaunchApp: () => ipcRenderer.invoke(ipcChannels.backupRelaunchApp),
  },
  episodes: {
    list: (accountId) => ipcRenderer.invoke(ipcChannels.episodesList, { accountId }),
    get: (id) => ipcRenderer.invoke(ipcChannels.episodesGet, { id }),
    addExecution: (input) => ipcRenderer.invoke(ipcChannels.episodesAddExecution, input),
  },
  import: {
    selectCsvFile: () => ipcRenderer.invoke(ipcChannels.importSelectCsv),
    previewExecutions: (input) => ipcRenderer.invoke(ipcChannels.importPreviewExecutions, input),
    commitExecutions: (input) => ipcRenderer.invoke(ipcChannels.importCommitExecutions, input),
  },
  playbook: {
    list: (status) => ipcRenderer.invoke(ipcChannels.playbookList, { status }),
    create: (input) => ipcRenderer.invoke(ipcChannels.playbookCreate, input),
    update: (id, input) => ipcRenderer.invoke(ipcChannels.playbookUpdate, { id, input }),
    archive: (id) => ipcRenderer.invoke(ipcChannels.playbookArchive, { id }),
    activationChecklist: (symbol) => ipcRenderer.invoke(ipcChannels.playbookActivationChecklist, { symbol }),
  },
  sip: {
    listPlans: (statuses) => ipcRenderer.invoke(ipcChannels.sipListPlans, { statuses }),
    getPlan: (id) => ipcRenderer.invoke(ipcChannels.sipGetPlan, { id }),
    create: (input) => ipcRenderer.invoke(ipcChannels.sipCreatePlan, input),
    update: (id, input) => ipcRenderer.invoke(ipcChannels.sipUpdatePlan, { id, input }),
    setStatus: (id, status) => ipcRenderer.invoke(ipcChannels.sipSetStatus, { id, status }),
    delete: (id) => ipcRenderer.invoke(ipcChannels.sipDeletePlan, { id }),
    deletePlan: (id) => ipcRenderer.invoke(ipcChannels.sipDeletePlan, { id }),
    schedulePause: (id, fromDate) => ipcRenderer.invoke(ipcChannels.sipSchedulePause, { id, fromDate }),
    cancelScheduledPause: (id) => ipcRenderer.invoke(ipcChannels.sipCancelScheduledPause, { id }),
    previewSchedule: (input) => ipcRenderer.invoke(ipcChannels.sipPreviewSchedule, input),
    listOccurrences: (planId, from, to) =>
      ipcRenderer.invoke(ipcChannels.sipListOccurrences, { planId, from, to }),
    listOccurrenceViews: (planId, from, to) =>
      ipcRenderer.invoke(ipcChannels.sipListOccurrenceViews, { planId, from, to }),
    confirmOccurrence: (input) => ipcRenderer.invoke(ipcChannels.sipConfirmOccurrence, input),
    skipOccurrence: (id, reason) => ipcRenderer.invoke(ipcChannels.sipSkipOccurrence, { id, reason }),
    getSummary: () => ipcRenderer.invoke(ipcChannels.sipGetSummary),
    scanDue: () => ipcRenderer.invoke(ipcChannels.sipScanDue),
    getOccurrenceCalendar: (month) => ipcRenderer.invoke(ipcChannels.sipGetOccurrenceCalendar, { month }),
    getPositionMeta: (accountId) => ipcRenderer.invoke(ipcChannels.sipGetPositionMeta, { accountId }),
    getReviewTemplate: (planId) => ipcRenderer.invoke(ipcChannels.sipGetReviewTemplate, { planId }),
    getPlanPositionLink: (planId) => ipcRenderer.invoke(ipcChannels.sipGetPlanPositionLink, { planId }),
    listPlansBySymbol: (accountId, symbol) =>
      ipcRenderer.invoke(ipcChannels.sipListPlansBySymbol, { accountId, symbol }),
    parseImportCsv: (sourcePath) => ipcRenderer.invoke(ipcChannels.sipParseImportCsv, { sourcePath }),
    previewImport: (input) => ipcRenderer.invoke(ipcChannels.sipPreviewImport, input),
    commitImport: (input) => ipcRenderer.invoke(ipcChannels.sipCommitImport, input),
    selectImportScreenshot: () => ipcRenderer.invoke(ipcChannels.sipSelectImportScreenshot),
    recognizeImportScreenshot: (sourcePath) =>
      ipcRenderer.invoke(ipcChannels.sipRecognizeImportScreenshot, { sourcePath }),
    previewAiImport: (input) => ipcRenderer.invoke(ipcChannels.sipPreviewAiImport, input),
    commitAiImport: (input) => ipcRenderer.invoke(ipcChannels.sipCommitAiImport, input),
  },
  lofArbitrage: {
    listWatchItems: () => ipcRenderer.invoke(ipcChannels.lofArbitrageListWatchItems),
    addWatchItem: (symbol, notes) => ipcRenderer.invoke(ipcChannels.lofArbitrageAddWatchItem, { symbol, notes }),
    removeWatchItem: (id) => ipcRenderer.invoke(ipcChannels.lofArbitrageRemoveWatchItem, { id }),
    listRules: () => ipcRenderer.invoke(ipcChannels.lofArbitrageListRules),
    createRule: (input) => ipcRenderer.invoke(ipcChannels.lofArbitrageCreateRule, input),
    setRuleStatus: (id, status) => ipcRenderer.invoke(ipcChannels.lofArbitrageSetRuleStatus, { id, status }),
    deleteRule: (id) => ipcRenderer.invoke(ipcChannels.lofArbitrageDeleteRule, { id }),
    getSnapshot: (symbol) => ipcRenderer.invoke(ipcChannels.lofArbitrageGetSnapshot, { symbol }),
    refreshMonitor: () => ipcRenderer.invoke(ipcChannels.lofArbitrageRefreshMonitor),
    scanMarket: (limit) => ipcRenderer.invoke(ipcChannels.lofArbitrageScanMarket, { limit }),
    listEvents: (limit) => ipcRenderer.invoke(ipcChannels.lofArbitrageListEvents, { limit }),
    setEventAction: (id, action) => ipcRenderer.invoke(ipcChannels.lofArbitrageSetEventAction, { id, action }),
  },
};

contextBridge.exposeInMainWorld('desktop', desktopApi);
