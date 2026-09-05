import { SoundOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Checkbox, Descriptions, Input, InputNumber, Modal, Select, Space, Switch, Tag } from 'antd';
import { Link } from 'react-router';
import type {
  AssetStats,
  BackupExportResult,
  HealthResult,
  ImportedAsset,
  LicenseStatus,
  LlmUsageSummary,
  LlmUserSettings,
  UpdateState,
} from '../../shared/api.types';
import type { AccessLockSettingsView } from '../../shared/security/access-lock.types';
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
import {
  getReminderSoundSettings,
  playReminderSound,
  reminderSoundOptions,
  saveReminderSoundSettings,
  type ReminderSoundSettings,
} from '../lib/reminder-sound';

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
  const [accessLock, setAccessLock] = useState<AccessLockSettingsView | null>(null);
  const [accessLockBusy, setAccessLockBusy] = useState(false);
  const [newAccessPassword, setNewAccessPassword] = useState('');
  const [confirmAccessPassword, setConfirmAccessPassword] = useState('');
  const [currentAccessPassword, setCurrentAccessPassword] = useState('');
  const [changeAccessPassword, setChangeAccessPassword] = useState('');
  const [confirmChangeAccessPassword, setConfirmChangeAccessPassword] = useState('');
  const [disableAccessLockOpen, setDisableAccessLockOpen] = useState(false);
  const [reminderSoundSettings, setReminderSoundSettings] = useState<ReminderSoundSettings>(getReminderSoundSettings);
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

  const refreshAccessLockPanel = useCallback(async (): Promise<void> => {
    setAccessLock(await window.desktop.settings.getAccessLock());
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
      window.desktop.settings.getAccessLock(),
    ])
      .then(([nextHealth, nextStats, nextUpdateState, llmStatus, usage, settings, nextLicenseStatus, nextAccessLock]) => {
        if (!active || seq !== statusLoadSeq.current) return;
        setHealth(nextHealth);
        setStats(nextStats);
        setUpdateState(nextUpdateState);
        setLlmConfigured(llmStatus.configured);
        setLlmUsage(usage);
        setLlmSettings(settings);
        setLicenseStatus(nextLicenseStatus);
        setAccessLock(nextAccessLock);
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
          <p>
            导入会用备份文件<strong>完全覆盖</strong>当前设备上的交易计划、提醒、复盘、持仓与图片数据。
          </p>
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

  const enableAccessLock = async (): Promise<void> => {
    if (newAccessPassword.length < 4) {
      void message.warning('访问密码至少 4 位');
      return;
    }
    if (newAccessPassword !== confirmAccessPassword) {
      void message.warning('两次输入的密码不一致');
      return;
    }
    setAccessLockBusy(true);
    try {
      setAccessLock(await window.desktop.settings.enableAccessLock(newAccessPassword));
      setNewAccessPassword('');
      setConfirmAccessPassword('');
      void message.success('访问密码已启用');
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '启用失败');
    } finally {
      setAccessLockBusy(false);
    }
  };

  const toggleAccessLock = async (checked: boolean): Promise<void> => {
    if (checked) {
      if (!accessLock?.hasPassword) {
        void message.warning('请先设置并保存访问密码');
        return;
      }
      setAccessLockBusy(true);
      try {
        setAccessLock(await window.desktop.settings.enableExistingAccessLock());
        void message.success('访问密码保护已开启');
      } catch (reason) {
        void message.error(reason instanceof Error ? reason.message : '开启失败');
      } finally {
        setAccessLockBusy(false);
      }
      return;
    }

    setDisableAccessLockOpen(true);
  };

  const disableAccessLock = async (): Promise<void> => {
    if (!currentAccessPassword.trim()) {
      void message.warning('请输入当前密码');
      return;
    }
    setAccessLockBusy(true);
    try {
      setAccessLock(await window.desktop.settings.disableAccessLock(currentAccessPassword));
      setCurrentAccessPassword('');
      setDisableAccessLockOpen(false);
      void message.success('访问密码保护已关闭');
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '关闭失败');
    } finally {
      setAccessLockBusy(false);
    }
  };

  const changeAccessLockPassword = async (): Promise<void> => {
    if (changeAccessPassword.length < 4) {
      void message.warning('新密码至少 4 位');
      return;
    }
    if (changeAccessPassword !== confirmChangeAccessPassword) {
      void message.warning('两次输入的新密码不一致');
      return;
    }
    if (!currentAccessPassword.trim()) {
      void message.warning('请输入当前密码');
      return;
    }
    setAccessLockBusy(true);
    try {
      setAccessLock(await window.desktop.settings.changeAccessLockPassword(currentAccessPassword, changeAccessPassword));
      setCurrentAccessPassword('');
      setChangeAccessPassword('');
      setConfirmChangeAccessPassword('');
      void message.success('访问密码已更新');
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '修改失败');
    } finally {
      setAccessLockBusy(false);
    }
  };

  const updateReminderSoundSettings = (next: ReminderSoundSettings, successMessage?: string): void => {
    try {
      saveReminderSoundSettings(next);
      setReminderSoundSettings(next);
      if (successMessage) void message.success(successMessage);
    } catch {
      void message.error('提示音设置保存失败');
    }
  };

  const previewReminderSound = async (): Promise<void> => {
    try {
      await playReminderSound(reminderSoundSettings.sound);
    } catch {
      void message.error('提示音播放失败，请检查系统音量或音频权限');
    }
  };

  return (
    <main className="workspace-page settings-page">
      <header className="page-header">
        <div>
          <p className="page-kicker">LOCAL FIRST</p>
          <h1>数据与设置</h1>
          <p className="page-intro">核心记录保存在本机 SQLite，截图进入内容哈希文件仓库。</p>
        </div>
        <Tag color={health?.storageReady ? 'green' : 'orange'}>{health?.storageReady ? '本地存储正常' : '正在检查存储'}</Tag>
      </header>

      <nav className="settings-navigation" aria-label="设置分类">
        {[
          ['license', '授权'],
          ['security', '访问密码'],
          ['notifications', '提醒声音'],
          ['runtime', '运行状态'],
          ['backup', '备份恢复'],
          ['ai', 'AI 配置'],
          ['usage', '用量'],
          ['updates', '更新与附件'],
        ].map(([id, label]) => (
          <button
            type="button"
            key={id}
            onClick={() => document.getElementById(`settings-${id}`)?.scrollIntoView({ block: 'start' })}
          >
            {label}
          </button>
        ))}
      </nav>
      <section id="settings-license" className="settings-panel">
        <div className="section-heading">
          <div>
            <span className="section-label">PRO</span>
            <h2>License 激活</h2>
          </div>
          <Tag color={getLicenseTagColor(licenseStatus)}>{licenseStatus ? formatLicenseTierLabel(licenseStatus) : '读取中'}</Tag>
        </div>
        <p className="page-intro">
          新用户默认享有 {TRIAL_DAYS} 天 Pro 试用。付费后请将激活码粘贴到下方；验证完全在本机离线完成，不上传任何数据。
        </p>
        {licenseNotice ? (
          <Alert
            type="success"
            showIcon
            style={{ marginBottom: 16 }}
            title="Pro 已激活"
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
              children: licenseStatus?.activatedAt ? new Date(licenseStatus.activatedAt).toLocaleString('zh-CN') : '—',
            },
          ]}
        />
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          {licenseStatus?.source === 'license' && !showRenewForm ? (
            <Alert
              type="info"
              showIcon
              title="当前已通过 License 激活"
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

      <section id="settings-security" className="settings-panel">
        <div className="section-heading">
          <div>
            <span className="section-label">安全</span>
            <h2>启动访问密码</h2>
          </div>
          <Tag color={accessLock?.enabled ? 'green' : 'default'}>{accessLock?.enabled ? '已开启' : '未开启'}</Tag>
        </div>
        <p className="page-intro">
          开启后，启动页结束需输入密码才能进入工作台。密码哈希保存在本机 userData，不会写入 SQLite 或备份文件。
        </p>
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Space wrap align="center">
            <span>启动时需要密码</span>
            <Switch
              checked={accessLock?.enabled ?? false}
              loading={accessLockBusy}
              onChange={(checked) => void toggleAccessLock(checked)}
            />
          </Space>

          {!accessLock?.hasPassword ? (
            <>
              <Input.Password
                placeholder="设置访问密码（至少 4 位）"
                value={newAccessPassword}
                autoComplete="new-password"
                onChange={(event) => setNewAccessPassword(event.target.value)}
              />
              <Input.Password
                placeholder="确认访问密码"
                value={confirmAccessPassword}
                autoComplete="new-password"
                onChange={(event) => setConfirmAccessPassword(event.target.value)}
              />
              <Button type="primary" loading={accessLockBusy} onClick={() => void enableAccessLock()}>
                保存并启用
              </Button>
            </>
          ) : (
            <>
              {!accessLock.enabled ? (
                <Alert type="info" showIcon title="访问密码已设置" description="打开上方开关即可在启动时要求输入密码。" />
              ) : null}
              <Input.Password
                placeholder="当前访问密码"
                value={currentAccessPassword}
                autoComplete="current-password"
                onChange={(event) => setCurrentAccessPassword(event.target.value)}
              />
              <Input.Password
                placeholder="新访问密码（至少 4 位）"
                value={changeAccessPassword}
                autoComplete="new-password"
                onChange={(event) => setChangeAccessPassword(event.target.value)}
              />
              <Input.Password
                placeholder="确认新密码"
                value={confirmChangeAccessPassword}
                autoComplete="new-password"
                onChange={(event) => setConfirmChangeAccessPassword(event.target.value)}
              />
              <Space wrap>
                <Button loading={accessLockBusy} onClick={() => void changeAccessLockPassword()}>
                  修改密码
                </Button>
                <Button loading={accessLockBusy} onClick={() => void refreshAccessLockPanel()}>
                  刷新状态
                </Button>
              </Space>
            </>
          )}
        </Space>
      </section>

      <section id="settings-notifications" className="settings-panel notification-sound-panel">
        <div className="section-heading">
          <div>
            <span className="section-label">提醒</span>
            <h2>声音提醒</h2>
          </div>
          <Tag color={reminderSoundSettings.enabled ? 'green' : 'default'}>
            {reminderSoundSettings.enabled ? '已开启' : '已关闭'}
          </Tag>
        </div>
        <p className="page-intro">
          新的价格提醒、定投待确认或 LOF 监控消息出现时播放提示音。关闭声音不会影响系统通知和提醒记录。
        </p>
        <div className="notification-sound-settings">
          <div className="notification-sound-row">
            <div>
              <strong>播放提示音</strong>
              <span>仅在产生新的提醒消息时播放，不会在应用启动时重复播放。</span>
            </div>
            <Switch
              checked={reminderSoundSettings.enabled}
              checkedChildren="开"
              unCheckedChildren="关"
              onChange={(enabled) =>
                updateReminderSoundSettings({ ...reminderSoundSettings, enabled }, enabled ? '声音提醒已开启' : '声音提醒已关闭')
              }
            />
          </div>
          <div className="notification-sound-row">
            <div>
              <strong>提示音</strong>
              <span>{reminderSoundOptions.find((option) => option.value === reminderSoundSettings.sound)?.description}</span>
            </div>
            <div className="notification-sound-actions">
              <Select
                aria-label="选择提示音"
                value={reminderSoundSettings.sound}
                options={reminderSoundOptions.map(({ value, label }) => ({ value, label }))}
                onChange={(sound) => updateReminderSoundSettings({ ...reminderSoundSettings, sound })}
              />
              <Button icon={<SoundOutlined />} onClick={() => void previewReminderSound()}>
                试听
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section id="settings-runtime" className="settings-panel">
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

      <section id="settings-backup" className="settings-panel">
        <div className="section-heading">
          <div>
            <span className="section-label">数据迁移</span>
            <h2>导出与导入</h2>
          </div>
        </div>
        <p className="page-intro">
          将本机 SQLite 数据库、图片仓库和 AI 设置打包为 ZIP 备份，换设备后可导入继续记录。OpenRouter API Key
          不会写入备份文件，需在新设备重新配置。
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
              title="最近一次导出"
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

      <section id="settings-ai" className="settings-panel">
        <div className="section-heading">
          <div>
            <span className="section-label">AI 辅助</span>
            <h2>OpenRouter 配置</h2>
          </div>
          <Tag color={llmConfigured ? 'green' : 'default'}>{llmConfigured ? '已配置' : '未配置'}</Tag>
        </div>
        <p className="page-intro">
          API Key 保存在本机 userData 目录，不会写入 SQLite 或前端存储。AI 用于公司信息助手、复盘草稿与截图识别，不提供买卖建议。
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

      <section id="settings-usage" className="settings-panel">
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
            {import.meta.env.DEV ? <Link to={routePaths.devLlm}>打开 Prompt 调试面板（仅开发模式）</Link> : null}
          </Space>
        ) : null}
      </section>

      <div id="settings-updates">
        <UpdaterPanel
          updateState={updateState}
          updateBusy={updateBusy}
          onCheck={() => void runUpdateAction(() => window.desktop.updater.check(), '检查更新失败')}
          onDownload={() => void runUpdateAction(() => window.desktop.updater.download(), '下载更新失败')}
          onInstall={() => void runUpdateAction(() => window.desktop.updater.install(), '安装更新失败')}
          onOpenRelease={() => void runUpdateAction(() => window.desktop.updater.openReleasePage(), '打开下载页面失败')}
        />
      </div>
      <AssetWorkspace stats={stats} lastAsset={lastAsset} busy={assetBusy} error={error} onImport={() => void importImage()} />

      <Modal
        title="关闭访问密码"
        open={disableAccessLockOpen}
        okText="确认关闭"
        confirmLoading={accessLockBusy}
        onCancel={() => {
          setDisableAccessLockOpen(false);
          setCurrentAccessPassword('');
        }}
        onOk={() => void disableAccessLock()}
      >
        <p>关闭后，启动时将不再要求输入密码。</p>
        <Input.Password
          placeholder="当前访问密码"
          value={currentAccessPassword}
          autoComplete="current-password"
          onChange={(event) => setCurrentAccessPassword(event.target.value)}
          onPressEnter={() => void disableAccessLock()}
        />
      </Modal>
    </main>
  );
}
