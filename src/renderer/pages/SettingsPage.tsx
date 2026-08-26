import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Checkbox, Descriptions, Input, InputNumber, Modal, Space, Switch, Tag } from 'antd';
import { Link } from 'react-router';
import type { AssetStats, BackupExportResult, HealthResult, ImportedAsset, LicenseStatus, LlmUsageSummary, LlmUserSettings, UpdateState } from '../../shared/api.types';
import { AssetWorkspace } from '../components/AssetWorkspace';
import { UpdaterPanel } from '../components/UpdaterPanel';
import { aiClient } from '../lib/ai/ai-client';
import { getLlmErrorMessage } from '../lib/ai/llm-errors';
import {
  formatLicenseExpiryLabel,
  formatLicenseSourceLabel,
  formatLicenseTierLabel,
  getLicenseErrorMessage,
  getLicenseTagColor,
} from '../lib/license-client';
import { routePaths } from '../router/paths';
import { TRIAL_DAYS } from '../../shared/license/features';

export function SettingsPage(): React.JSX.Element {
  const { message } = App.useApp();
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [stats, setStats] = useState<AssetStats | null>(null);
  const [lastAsset, setLastAsset] = useState<ImportedAsset | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assetBusy, setAssetBusy] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [llmConfigured, setLlmConfigured] = useState(false);
  const [llmApiKey, setLlmApiKey] = useState('');
  const [llmBusy, setLlmBusy] = useState(false);
  const [llmTestResult, setLlmTestResult] = useState<string | null>(null);
  const [llmUsage, setLlmUsage] = useState<LlmUsageSummary | null>(null);
  const [llmSettings, setLlmSettings] = useState<LlmUserSettings | null>(null);
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [licenseCode, setLicenseCode] = useState('');
  const [licenseBusy, setLicenseBusy] = useState(false);
  const [licenseNotice, setLicenseNotice] = useState<string | null>(null);
  const [showRenewForm, setShowRenewForm] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [includeLicenseInBackup, setIncludeLicenseInBackup] = useState(true);
  const [lastBackup, setLastBackup] = useState<BackupExportResult | null>(null);
  const statusLoadSeq = useRef(0);

  const refreshRuntime = useCallback(async (): Promise<void> => {
    const [nextHealth, nextStats] = await Promise.all([window.desktop.system.health(), window.desktop.assets.stats()]);
    setHealth(nextHealth);
    setStats(nextStats);
  }, []);

  const refreshLicensePanel = useCallback(async (): Promise<void> => {
    const seq = ++statusLoadSeq.current;
    const status = await window.desktop.license.getStatus();
    if (seq !== statusLoadSeq.current) return;
    setLicenseStatus(status);
  }, []);

  const refreshLlmPanel = useCallback(async (): Promise<void> => {
    const [status, usage, settings] = await Promise.all([
      aiClient.getLlmStatus(),
      aiClient.getLlmUsage(),
      aiClient.getLlmSettings(),
    ]);
    setLlmConfigured(status.configured);
    setLlmUsage(usage);
    setLlmSettings(settings);
  }, []);

  useEffect(() => {
    let active = true;
    const seq = ++statusLoadSeq.current;
    void Promise.all([
      window.desktop.system.health(),
      window.desktop.assets.stats(),
      window.desktop.updater.getState(),
      aiClient.getLlmStatus(),
      aiClient.getLlmUsage(),
      aiClient.getLlmSettings(),
      window.desktop.license.getStatus(),
    ])
      .then(([nextHealth, nextStats, nextUpdateState, llmStatus, usage, settings, nextLicenseStatus]) => {
        if (!active || seq !== statusLoadSeq.current) return;
        setHealth(nextHealth);
        setStats(nextStats);
        setUpdateState(nextUpdateState);
        setLlmConfigured(llmStatus.configured);
        setLlmUsage(usage);
        setLlmSettings(settings);
        setLicenseStatus(nextLicenseStatus);
      })
      .catch((reason: unknown) => {
        if (active && seq === statusLoadSeq.current) {
          setError(reason instanceof Error ? reason.message : '运行状态读取失败');
        }
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

  const activateLicense = async (): Promise<void> => {
    if (!licenseCode.trim()) {
      void message.warning('请粘贴激活码');
      return;
    }
    setLicenseBusy(true);
    setLicenseNotice(null);
    try {
      statusLoadSeq.current += 1;
      const result = await window.desktop.license.activate(licenseCode.trim());
      const latest = await window.desktop.license.getStatus();
      setLicenseStatus(latest);
      setLicenseCode('');
      setLicenseNotice(result.message);
      setShowRenewForm(false);
      void message.success('Pro 激活成功');
    } catch (reason) {
      void message.error(getLicenseErrorMessage(reason, '激活失败'));
    } finally {
      setLicenseBusy(false);
    }
  };

  const saveLlmApiKey = async (): Promise<void> => {
    if (!llmApiKey.trim()) {
      void message.warning('请输入 OpenRouter API Key');
      return;
    }
    setLlmBusy(true);
    setLlmTestResult(null);
    try {
      const status = await aiClient.saveLlmApiKey(llmApiKey.trim());
      setLlmConfigured(status.configured);
      setLlmApiKey('');
      void message.success('API Key 已保存到本机凭据文件');
      await refreshLlmPanel();
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '保存 API Key 失败');
    } finally {
      setLlmBusy(false);
    }
  };

  const testLlmConnection = async (): Promise<void> => {
    setLlmBusy(true);
    setLlmTestResult(null);
    try {
      const result = await aiClient.testLlmConnection();
      setLlmTestResult(`连接成功 · ${result.model} · ${result.latencyMs}ms`);
      void message.success('OpenRouter 连接正常');
    } catch (reason) {
      const text = getLlmErrorMessage(reason, '连接测试失败');
      setLlmTestResult(text);
      void message.error(text);
    } finally {
      setLlmBusy(false);
    }
  };

  const saveLlmSettings = async (): Promise<void> => {
    if (!llmSettings) return;
    setLlmBusy(true);
    try {
      const saved = await aiClient.saveLlmSettings(llmSettings);
      setLlmSettings(saved);
      await refreshLlmPanel();
      void message.success('AI 设置已保存');
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '保存 AI 设置失败');
    } finally {
      setLlmBusy(false);
    }
  };

  const formatBackupStats = (stats: BackupExportResult['stats']): string =>
    `${stats.tradingPlans} 个计划 · ${stats.tradeAlerts} 条提醒 · ${stats.tradeReviews} 篇复盘 · ${stats.portfolioLedgerEntries} 笔持仓流水 · ${stats.assets} 张图片`;

  const exportBackup = async (): Promise<void> => {
    setBackupBusy(true);
    setError(null);
    try {
      const result = await window.desktop.backup.export({ includeLicense: includeLicenseInBackup });
      if (!result) return;
      setLastBackup(result);
      void message.success(`备份已保存：${formatBackupStats(result.stats)}`);
    } catch (reason) {
      const text = reason instanceof Error ? reason.message : '导出失败';
      setError(text);
      void message.error(text);
    } finally {
      setBackupBusy(false);
    }
  };

  const importBackup = (): void => {
    Modal.confirm({
      title: '导入本地数据',
      okText: '确认导入',
      okButtonProps: { danger: true },
      cancelText: '取消',
      content: (
        <div>
          <p>导入会用备份文件<strong>完全覆盖</strong>当前设备上的交易计划、提醒、复盘、持仓与图片数据。</p>
          <p>此操作不可撤销。导入完成后应用会自动重启。</p>
        </div>
      ),
      onOk: async () => {
        setBackupBusy(true);
        setError(null);
        try {
          const result = await window.desktop.backup.import();
          if (!result) return;
          void message.success(`已导入 ${formatBackupStats(result.stats)}，应用即将重启…`, 2);
          window.setTimeout(() => {
            void window.desktop.backup.relaunchApp();
          }, 1500);
        } catch (reason) {
          const text = reason instanceof Error ? reason.message : '导入失败';
          setError(text);
          void message.error(text);
          throw reason;
        } finally {
          setBackupBusy(false);
        }
      },
    });
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
            <span className="section-label">PRO</span>
            <h2>License 激活</h2>
          </div>
          <Tag color={getLicenseTagColor(licenseStatus)}>
            {licenseStatus ? formatLicenseTierLabel(licenseStatus) : '读取中'}
          </Tag>
        </div>
        <p className="page-intro">
          新用户默认享有 {TRIAL_DAYS} 天 Pro 试用。付费后请将激活码粘贴到下方；验证完全在本机离线完成，不上传任何数据。
        </p>
        {licenseNotice ? (
          <Alert
            type="success"
            showIcon
            style={{ marginBottom: 16 }}
            message="Pro 已激活"
            description={licenseNotice}
            closable
            onClose={() => setLicenseNotice(null)}
          />
        ) : null}
        <Descriptions
          bordered
          column={2}
          style={{ marginBottom: 16 }}
          key={`${licenseStatus?.tier ?? 'loading'}-${licenseStatus?.licenseId ?? 'none'}-${licenseStatus?.source ?? 'none'}`}
          items={[
            {
              key: 'tier',
              label: '当前档位',
              children: licenseStatus ? formatLicenseTierLabel(licenseStatus) : '—',
            },
            {
              key: 'source',
              label: '授权来源',
              children: licenseStatus ? formatLicenseSourceLabel(licenseStatus) : '—',
            },
            {
              key: 'exp',
              label: '到期日',
              children: licenseStatus ? formatLicenseExpiryLabel(licenseStatus) : '—',
            },
            {
              key: 'limits',
              label: '计划 / 提醒上限',
              children: licenseStatus
                ? licenseStatus.limits.maxPlans === null
                  ? '无限制'
                  : `${licenseStatus.limits.maxPlans} 个计划 · ${licenseStatus.limits.maxAlerts} 条提醒`
                : '—',
            },
            {
              key: 'licenseId',
              label: 'License 编号',
              children: licenseStatus?.licenseId ?? '—',
            },
            {
              key: 'activatedAt',
              label: '激活时间',
              children: licenseStatus?.activatedAt
                ? new Date(licenseStatus.activatedAt).toLocaleString('zh-CN')
                : '—',
            },
          ]}
        />
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          {licenseStatus?.source === 'license' && !showRenewForm ? (
            <Alert
              type="info"
              showIcon
              message="当前已通过 License 激活"
              action={
                <Button size="small" onClick={() => setShowRenewForm(true)}>
                  更换激活码
                </Button>
              }
            />
          ) : (
            <Input.TextArea
              value={licenseCode}
              placeholder="粘贴 TD1.... 激活码"
              autoSize={{ minRows: 2, maxRows: 4 }}
              onChange={(event) => setLicenseCode(event.target.value)}
            />
          )}
          <Space wrap>
            {licenseStatus?.source !== 'license' || showRenewForm ? (
              <Button type="primary" loading={licenseBusy} onClick={() => void activateLicense()}>
                {licenseStatus?.source === 'license' ? '更换 License' : '激活 Pro'}
              </Button>
            ) : null}
            {showRenewForm ? (
              <Button
                onClick={() => {
                  setShowRenewForm(false);
                  setLicenseCode('');
                }}
              >
                取消
              </Button>
            ) : null}
            <Button loading={licenseBusy} onClick={() => void refreshLicensePanel()}>
              刷新状态
            </Button>
          </Space>
        </Space>
      </section>

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

      <section className="settings-panel">
        <div className="section-heading">
          <div>
            <span className="section-label">数据迁移</span>
            <h2>导出与导入</h2>
          </div>
        </div>
        <p className="page-intro">
          将本机 SQLite 数据库、图片仓库和 AI 设置打包为 ZIP 备份，换设备后可导入继续记录。OpenRouter API Key 不会写入备份文件，需在新设备重新配置。
        </p>
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Checkbox checked={includeLicenseInBackup} onChange={(event) => setIncludeLicenseInBackup(event.target.checked)}>
            导出时包含 License 激活信息
          </Checkbox>
          <Space wrap>
            <Button type="primary" loading={backupBusy} onClick={() => void exportBackup()}>
              导出备份
            </Button>
            <Button danger loading={backupBusy} onClick={importBackup}>
              导入备份
            </Button>
          </Space>
          {lastBackup ? (
            <Alert
              type="success"
              showIcon
              message="最近一次导出"
              description={
                <>
                  <div>{lastBackup.filePath}</div>
                  <div>{formatBackupStats(lastBackup.stats)}</div>
                  <div>数据库结构 v{lastBackup.manifest.schemaVersion}</div>
                </>
              }
            />
          ) : null}
        </Space>
      </section>

      <section className="settings-panel">
        <div className="section-heading">
          <div>
            <span className="section-label">AI 辅助</span>
            <h2>OpenRouter 配置</h2>
          </div>
          <Tag color={llmConfigured ? 'green' : 'default'}>{llmConfigured ? '已配置' : '未配置'}</Tag>
        </div>
        <p className="page-intro">
          API Key 保存在本机 userData 目录，不会写入 SQLite 或前端存储。AI 仅用于复盘草稿与发布说明，不提供买卖建议。
        </p>
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Input.Password
            value={llmApiKey}
            placeholder={llmConfigured ? '输入新 Key 可覆盖现有配置' : 'sk-or-...'}
            onChange={(event) => setLlmApiKey(event.target.value)}
            autoComplete="off"
          />
          <Space wrap>
            <Button type="primary" loading={llmBusy} onClick={() => void saveLlmApiKey()}>
              保存 API Key
            </Button>
            <Button loading={llmBusy} disabled={!llmConfigured && !llmApiKey.trim()} onClick={() => void testLlmConnection()}>
              测试连接
            </Button>
          </Space>
          {llmTestResult ? <p className="dialog-intro">{llmTestResult}</p> : null}
        </Space>
      </section>

      <section className="settings-panel">
        <div className="section-heading">
          <div>
            <span className="section-label">Token 预算</span>
            <h2>本月用量</h2>
          </div>
          <Tag color={llmUsage?.budgetExceeded ? 'red' : 'blue'}>{llmUsage?.month ?? '—'}</Tag>
        </div>
        <Descriptions
          bordered
          column={2}
          items={[
            { key: 'requests', label: '请求次数', children: llmUsage?.requestCount ?? '—' },
            { key: 'tokens', label: '总 Token', children: llmUsage ? llmUsage.totalTokens.toLocaleString() : '—' },
            {
              key: 'budget',
              label: '预算剩余',
              children:
                llmUsage?.monthlyTokenBudget === null
                  ? '未限制'
                  : llmUsage
                    ? `${llmUsage.budgetRemaining?.toLocaleString() ?? 0} / ${llmUsage.monthlyTokenBudget.toLocaleString()}`
                    : '—',
            },
            {
              key: 'io',
              label: '输入 / 输出',
              children: llmUsage ? `${llmUsage.totalInputTokens} / ${llmUsage.totalOutputTokens}` : '—',
            },
          ]}
        />
        {llmSettings ? (
          <Space orientation="vertical" size="middle" style={{ width: '100%', marginTop: 16 }}>
            <Space wrap align="center">
              <span>每月 Token 上限</span>
              <InputNumber
                min={1}
                step={10_000}
                placeholder="留空表示不限制"
                value={llmSettings.monthlyTokenBudget ?? undefined}
                onChange={(value) =>
                  setLlmSettings((current) =>
                    current ? { ...current, monthlyTokenBudget: typeof value === 'number' ? value : null } : current,
                  )
                }
              />
              <span>调试日志</span>
              <Switch
                checked={llmSettings.debugLogging}
                onChange={(checked) => setLlmSettings((current) => (current ? { ...current, debugLogging: checked } : current))}
              />
              <Button loading={llmBusy} onClick={() => void saveLlmSettings()}>
                保存 AI 设置
              </Button>
            </Space>
            {import.meta.env.DEV ? (
              <Link to={routePaths.devLlm}>打开 Prompt 调试面板（仅开发模式）</Link>
            ) : null}
          </Space>
        ) : null}
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
