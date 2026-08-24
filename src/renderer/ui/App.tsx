import { useCallback, useEffect, useState } from 'react';
import type { AssetStats, HealthResult, ImportedAsset } from '../../shared/contracts';

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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
