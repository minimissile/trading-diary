import type { UpdateState } from '../../shared/api.types';

interface UpdaterPanelProps {
  updateState: UpdateState | null;
  updateBusy: boolean;
  onCheck: () => void;
  onDownload: () => void;
  onInstall: () => void;
}

export function UpdaterPanel({
  updateState,
  updateBusy,
  onCheck,
  onDownload,
  onInstall,
}: UpdaterPanelProps): React.JSX.Element {
  return (
    <section className="updater" aria-label="应用更新" aria-live="polite">
      <div>
        <h2>应用更新</h2>
        <p>{updateState?.message ?? '正在读取更新状态'}</p>
        <span>
          当前版本 {updateState?.currentVersion ?? '—'}
          {updateState?.availableVersion ? ` · 可用版本 ${updateState.availableVersion}` : null}
        </span>
        {updateState?.phase === 'downloading' ? (
          <progress max="100" value={updateState.downloadPercent ?? 0}>
            {updateState.downloadPercent ?? 0}%
          </progress>
        ) : null}
      </div>

      <div className="updater__actions">
        <button
          type="button"
          disabled={
            updateBusy ||
            !updateState ||
            updateState.phase === 'disabled' ||
            updateState.phase === 'downloading'
          }
          onClick={onCheck}
        >
          {updateState?.phase === 'checking' ? '检查中…' : '检查更新'}
        </button>
        {updateState?.phase === 'available' ? (
          <button type="button" disabled={updateBusy} onClick={onDownload}>
            下载更新
          </button>
        ) : null}
        {updateState?.phase === 'downloaded' ? (
          <button type="button" disabled={updateBusy} onClick={onInstall}>
            退出并安装
          </button>
        ) : null}
      </div>
    </section>
  );
}
