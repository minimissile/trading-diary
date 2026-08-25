import type { PropsWithChildren } from 'react';
import { App as AntdApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { appTheme } from '../theme';

const waveConfig = {
  disabled: true,
} as const;

const cspConfig = {
  nonce: 'trading-diary-antd',
} as const;

export function AppProviders({ children }: PropsWithChildren): React.JSX.Element {
  return (
    <ConfigProvider csp={cspConfig} iconPrefixCls="anticon" locale={zhCN} theme={appTheme} wave={waveConfig}>
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  );
}
