import type { PropsWithChildren } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { App, Button, Input } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { APP_NAME } from '../../shared/brand';

interface AccessLockGateProps extends PropsWithChildren {
  /** 启动页动画结束后才启用访问锁。 */
  gateActive: boolean;
}

export function AccessLockGate({ children, gateActive }: AccessLockGateProps): React.JSX.Element {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadSettings = useCallback(async (): Promise<void> => {
    if (!gateActive) {
      setLoading(false);
      setEnabled(false);
      return;
    }
    setLoading(true);
    try {
      const settings = await window.desktop.settings.getAccessLock();
      setEnabled(settings.enabled);
      if (!settings.enabled) setUnlocked(true);
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '访问锁配置读取失败');
      setUnlocked(true);
    } finally {
      setLoading(false);
    }
  }, [gateActive, message]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const submit = async (): Promise<void> => {
    if (!password.trim()) {
      void message.warning('请输入访问密码');
      return;
    }
    setSubmitting(true);
    try {
      const result = await window.desktop.settings.verifyAccessLock(password);
      if (!result.valid) {
        void message.error('密码不正确');
        return;
      }
      setUnlocked(true);
      setPassword('');
    } catch (reason) {
      void message.error(reason instanceof Error ? reason.message : '验证失败');
    } finally {
      setSubmitting(false);
    }
  };

  const locked = gateActive && enabled && !unlocked && !loading;

  return (
    <>
      <div className={locked ? 'access-lock-content access-lock-content--locked' : 'access-lock-content'}>
        {children}
      </div>

      {locked ? (
        <div className="access-lock-screen" role="dialog" aria-modal="true" aria-label="访问验证">
          <div className="access-lock-card">
            <div className="access-lock-icon" aria-hidden="true">
              <LockOutlined />
            </div>
            <h1>{APP_NAME}</h1>
            <p>请输入访问密码以进入工作台</p>
            <Input.Password
              value={password}
              placeholder="访问密码"
              autoFocus
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              onPressEnter={() => void submit()}
            />
            <Button type="primary" block loading={submitting} onClick={() => void submit()}>
              解锁
            </Button>
          </div>
        </div>
      ) : null}

      {gateActive && loading ? <div className="access-lock-screen access-lock-screen--loading" aria-hidden="true" /> : null}
    </>
  );
}
