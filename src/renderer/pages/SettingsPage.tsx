import { useCallback, useEffect, useState } from 'react';
import { App, Button, Descriptions, Tag } from 'antd';
import type { AssetStats, HealthResult, ImportedAsset, UpdateState } from '../../shared/api.types';
import { AssetWorkspace } from '../components/AssetWorkspace';
import { UpdaterPanel } from '../components/UpdaterPanel';

export function SettingsPage(): React.JSX.Element {
  const { message } = App.useApp();
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [stats, setStats] = useState<AssetStats | null>(null);
  const [lastAsset, setLastAsset] = useState<ImportedAsset | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assetBusy, setAssetBusy] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);

  const refreshRuntime = useCallback(async (): Promise<void> => {
    const [nextHealth, nextStats] = await Promise.all([window.desktop.system.health(), window.desktop.assets.stats()]);
    setHealth(nextHealth);
    setStats(nextStats);
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([window.desktop.system.health(), window.desktop.assets.stats(), window.desktop.updater.getState()])
      .then(([nextHealth, nextStats, nextUpdateState]) => {
        if (!active) return;
        setHealth(nextHealth);
        setStats(nextStats);
        setUpdateState(nextUpdateState);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : '运行状态读取失败');
      });
    const unsubscribe = window.desktop.updater.onStateChanged((state) => {
      if (active) setUpdateState(state);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const importImage = async (): Promise<void> => {
    setAssetBusy(true);
    setError(null);
    try {
      const asset = await window.desktop.assets.importImage();
      if (asset) {
        setLastAsset(asset);
        await refreshRuntime();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '图片导入失败');
    } finally {
      setAssetBusy(false);
    }
  };

  const runUpdateAction = async (action: () => Promise<UpdateState | void>, fallbackMessage: string): Promise<void> => {
    setUpdateBusy(true);
    try {
      const next = await action();
      if (next) setUpdateState(next);
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : fallbackMessage);
    } finally {
      setUpdateBusy(false);
    }
  };

  return (
    <main className="workspace-page">
      <header className="page-header">
        <div>
          <p className="page-kicker">LOCAL FIRST</p>
          <h1>数据与设置</h1>
          <p className="page-intro">核心记录保存在本机 SQLite，截图进入内容哈希文件仓库。</p>
        </div>
        <Tag color={health?.storageReady ? 'green' : 'orange'}>{health?.storageReady ? '本地存储正常' : '正在检查存储'}</Tag>
      </header>

      <section className="settings-panel">
        <div className="section-heading">
          <div>
            <span className="section-label">运行状态</span>
            <h2>本地数据服务</h2>
          </div>
          <Button onClick={() => void refreshRuntime()}>刷新状态</Button>
        </div>
        <Descriptions
          bordered
          column={2}
          items={[
            { key: 'service', label: '后台进程', children: health ? `PID ${health.servicePid}` : '连接中' },
            { key: 'sqlite', label: 'SQLite', children: health?.sqliteVersion ?? '—' },
            { key: 'schema', label: '数据库结构', children: health ? `v${health.schemaVersion}` : '—' },
            { key: 'assets', label: '本地图片', children: stats ? `${stats.count} 张` : '—' },
          ]}
        />
      </section>

      <UpdaterPanel
        updateState={updateState}
        updateBusy={updateBusy}
        onCheck={() => void runUpdateAction(() => window.desktop.updater.check(), '检查更新失败')}
        onDownload={() => void runUpdateAction(() => window.desktop.updater.download(), '下载更新失败')}
        onInstall={() => void runUpdateAction(() => window.desktop.updater.install(), '安装更新失败')}
        onOpenRelease={() => void runUpdateAction(() => window.desktop.updater.openReleasePage(), '打开下载页面失败')}
      />

      <AssetWorkspace stats={stats} lastAsset={lastAsset} busy={assetBusy} error={error} onImport={() => void importImage()} />
    </main>
  );
}
