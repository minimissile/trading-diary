import type { PropsWithChildren } from 'react';
import { App as AntdApp, ConfigProvider, type ThemeConfig } from 'antd';
import zhCN from 'antd/locale/zh_CN';

// 使用 Ant Design 6 静态样式，避免在 Electron 渲染进程中动态注入 style 标签。
const themeConfig: ThemeConfig = {
  zeroRuntime: true,
};

const waveConfig = {
  disabled: true,
} as const;

export function AppProviders({ children }: PropsWithChildren): React.JSX.Element {
  return (
    <ConfigProvider locale={zhCN} theme={themeConfig} wave={waveConfig}>
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  );
}
