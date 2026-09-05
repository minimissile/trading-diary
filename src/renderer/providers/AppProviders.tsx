import type { PropsWithChildren } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { App as AntdApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { queryClient } from '../lib/query-client';
import { QueryWorkspaceSync } from '../lib/queries';
import { appTheme } from '../theme';
import { ReminderSoundListener } from '../components/ReminderSoundListener';

const waveConfig = {
  disabled: true,
} as const;

const cspConfig = {
  nonce: 'trading-diary-antd',
} as const;

export function AppProviders({ children }: PropsWithChildren): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <QueryWorkspaceSync />
      <ReminderSoundListener />
      <ConfigProvider
        csp={cspConfig}
        iconPrefixCls="anticon"
        locale={zhCN}
        theme={appTheme}
        wave={waveConfig}
        modal={{ centered: true }}
      >
        <AntdApp>{children}</AntdApp>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
