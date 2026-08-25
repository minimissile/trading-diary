import { useCallback, useEffect, useState } from 'react';
import type { AssetStats, HealthResult, ImportedAsset, UpdateState } from '../../shared/api.types';
import { AssetWorkspace } from '../components/AssetWorkspace';
import { MetricsGrid } from '../components/MetricsGrid';
import { RuntimeHeader } from '../components/RuntimeHeader';
import { UpdaterPanel } from '../components/UpdaterPanel';

export function HomePage(): React.JSX.Element {
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [stats, setStats] = useState<AssetStats | null>(null);
  const [lastAsset, setLastAsset] = useState<ImportedAsset | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    const [nextHealth, nextStats] = await Promise.all([window.desktop.system.health(), window.desktop.assets.stats()]);
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

  const runUpdateAction = async (action: () => Promise<UpdateState | void>, fallbackMessage: string): Promise<void> => {
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
      <RuntimeHeader health={health} />
      <MetricsGrid health={health} stats={stats} />
      <UpdaterPanel
        updateState={updateState}
        updateBusy={updateBusy}
        onCheck={() => void runUpdateAction(() => window.desktop.updater.check(), '检查更新失败')}
        onDownload={() => void runUpdateAction(() => window.desktop.updater.download(), '下载更新失败')}
        onInstall={() => void runUpdateAction(() => window.desktop.updater.install(), '安装更新失败')}
      />
      <AssetWorkspace stats={stats} lastAsset={lastAsset} busy={busy} error={error} onImport={() => void importImage()} />
    </main>
  );
}
