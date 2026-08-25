import { Button, Progress } from 'antd';
import type { UpdateState } from '../../shared/api.types';

interface UpdaterPanelProps {
  updateState: UpdateState | null;
  updateBusy: boolean;
  onCheck: () => void;
  onDownload: () => void;
  onInstall: () => void;
}

export function UpdaterPanel({ updateState, updateBusy, onCheck, onDownload, onInstall }: UpdaterPanelProps): React.JSX.Element {
  return (
    <section className="updater" aria-label="应用更新" aria-live="polite">
      <div>
        <h2>应用更新</h2>
        <p>{updateState?.message ?? '正在读取更新状态'}</p>
        <span className="updater__version">
          当前版本 {updateState?.currentVersion ?? '—'}
          {updateState?.availableVersion ? ` · 可用版本 ${updateState.availableVersion}` : null}
        </span>
        {updateState?.phase === 'downloading' ? (
          <Progress className="updater__progress" percent={updateState.downloadPercent ?? 0} size="small" status="active" />
        ) : null}
      </div>

      <div className="updater__actions">
        <Button
          disabled={updateBusy || !updateState || updateState.phase === 'disabled' || updateState.phase === 'downloading'}
          onClick={onCheck}
          loading={updateState?.phase === 'checking'}
        >
          检查更新
        </Button>
        {updateState?.phase === 'available' ? (
          <Button type="primary" disabled={updateBusy} onClick={onDownload}>
            下载更新
          </Button>
        ) : null}
        {updateState?.phase === 'downloaded' ? (
          <Button type="primary" disabled={updateBusy} onClick={onInstall}>
            退出并安装
          </Button>
        ) : null}
      </div>
    </section>
  );
}
