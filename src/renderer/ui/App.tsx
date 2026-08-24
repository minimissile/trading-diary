import { useCallback, useEffect, useState } from 'react';
import type {
  AssetStats,
  HealthResult,
  ImportedAsset,
  UpdateState,
} from '../../shared/contracts';

function formatBytes(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'unit',
    unit: 'megabyte',
    maximumFractionDigits: 2,
  }).format(value / 1_048_576);
}

export function App(): React.JSX.Element {
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [stats, setStats] = useState<AssetStats | null>(null);
  const [lastAsset, setLastAsset] = useState<ImportedAsset | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    const [nextHealth, nextStats] = await Promise.all([
      window.desktop.system.health(),
      window.desktop.assets.stats(),
    ]);
    setHealth(nextHealth);
    setStats(nextStats);
  }, []);

  useEffect(() => {
    let active = true;

    void Promise.all([window.desktop.system.health(), window.desktop.assets.stats()])
      .then(([nextHealth, nextStats]) => {
        if (!active) return;
        setHealth(nextHealth);
        setStats(nextStats);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : '运行状态读取失败');
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const unsubscribe = window.desktop.updater.onStateChanged((state) => {
      if (active) setUpdateState(state);
    });

    void window.desktop.updater
      .getState()
      .then((state) => {
        if (active) setUpdateState(state);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : '更新状态读取失败');
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const importImage = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const asset = await window.desktop.assets.importImage();
      if (asset) {
        setLastAsset(asset);
        await refresh();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '图片导入失败');
    } finally {
      setBusy(false);
    }
  };

  const runUpdateAction = async (
    action: () => Promise<UpdateState | void>,
    fallbackMessage: string,
  ): Promise<void> => {
    setUpdateBusy(true);
    setError(null);
    try {
      const state = await action();
      if (state) setUpdateState(state);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : fallbackMessage);
    } finally {
      setUpdateBusy(false);
    }
  };

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">工程冒烟验证</p>
          <h1>桌面运行时</h1>
          <p className="summary">用于验证 React、类型化 IPC、后台进程、SQLite 和图片仓库。</p>
        </div>
        <span className={health ? 'status status--ready' : 'status'}>
          {health ? '后台已就绪' : '正在连接'}
        </span>
      </header>

      <section className="metrics" aria-label="运行状态">
        <article>
          <span>后台进程 PID</span>
          <strong>{health?.servicePid ?? '—'}</strong>
        </article>
        <article>
          <span>SQLite</span>
          <strong>{health?.sqliteVersion ?? '—'}</strong>
        </article>
        <article>
          <span>数据库结构</span>
          <strong>{health ? `v${health.schemaVersion}` : '—'}</strong>
        </article>
        <article>
          <span>图片</span>
          <strong>{stats?.count ?? '—'}</strong>
        </article>
      </section>

      <section className="updater" aria-label="应用更新" aria-live="polite">
        <div>
          <h2>应用更新</h2>
          <p>{updateState?.message ?? '正在读取更新状态'}</p>
          <span>
            当前版本 {updateState?.currentVersion ?? '—'}
            {updateState?.availableVersion
              ? ` · 可用版本 ${updateState.availableVersion}`
              : null}
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
            onClick={() =>
              void runUpdateAction(() => window.desktop.updater.check(), '检查更新失败')
            }
          >
            {updateState?.phase === 'checking' ? '检查中…' : '检查更新'}
          </button>
          {updateState?.phase === 'available' ? (
            <button
              type="button"
              disabled={updateBusy}
              onClick={() =>
                void runUpdateAction(() => window.desktop.updater.download(), '下载更新失败')
              }
            >
              下载更新
            </button>
          ) : null}
          {updateState?.phase === 'downloaded' ? (
            <button
              type="button"
              disabled={updateBusy}
              onClick={() =>
                void runUpdateAction(() => window.desktop.updater.install(), '安装更新失败')
              }
            >
              退出并安装
            </button>
          ) : null}
        </div>
      </section>

      <section className="workspace">
        <div>
          <h2>图片仓库验证</h2>
          <p>
            原图与缩略图按 SHA-256 分片存放；SQLite 保存元数据。当前原图占用
            {stats ? ` ${formatBytes(stats.originalBytes)}` : ' —'}。
          </p>
          <button type="button" disabled={busy} onClick={() => void importImage()}>
            {busy ? '处理中…' : '选择一张图片'}
          </button>
          {error ? <p className="error">{error}</p> : null}
        </div>

        <div className="preview" aria-live="polite">
          {lastAsset ? (
            <>
              <img src={lastAsset.previewUrl} alt="最近导入的图片预览" />
              <p>
                {lastAsset.width ?? '?'} × {lastAsset.height ?? '?'} ·{' '}
                {lastAsset.duplicate ? '已去重' : '已入库'}
              </p>
            </>
          ) : (
            <p>尚未导入图片</p>
          )}
        </div>
      </section>
    </main>
  );
}
