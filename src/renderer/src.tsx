import { StrictMode, useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import './styles/antd-theme.css';
import './styles/theme.css';
import { AppProviders } from './providers/AppProviders';
import { AppRouter } from './router';
import { AccessLockGate } from './components/AccessLockGate';
import { DesktopGate } from './components/DesktopGate';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SplashScreen } from './components/SplashScreen';
import { IS_RENDERER_DEV } from './lib/dev-mode';
import './styles/global.css';
import './styles/splash-screen.css';
import './styles/trading-workspace.css';
import './styles/chart.css';
import './styles/yingji-glass.css';
import './styles/ui-tokens.css';
import './styles/ui-components.css';
import './styles/window-titlebar.css';
import './styles/workspace-refinement.css';
import './styles/dividends.css';
import { APP_NAME } from '../shared/brand';

dayjs.locale('zh-cn');

const root = document.getElementById('root');
if (!root) throw new Error('找不到渲染进程根节点');

function AppRoot(): React.JSX.Element {
  const [splashFinished, setSplashFinished] = useState(() => IS_RENDERER_DEV);
  const handleSplashFinished = useCallback(() => setSplashFinished(true), []);

  return (
    <SplashScreen onFinished={handleSplashFinished}>
      <AccessLockGate gateActive={splashFinished}>
        <AppRouter />
      </AccessLockGate>
    </SplashScreen>
  );
}

function AppTree(): React.JSX.Element {
  return (
    <ErrorBoundary>
      <header className="window-titlebar" aria-label="窗口标题栏">
        <span>{APP_NAME}</span>
      </header>
      <AppProviders>
        <DesktopGate>
          <AppRoot />
        </DesktopGate>
      </AppProviders>
    </ErrorBoundary>
  );
}

createRoot(root).render(
  IS_RENDERER_DEV ? (
    <AppTree />
  ) : (
    <StrictMode>
      <AppTree />
    </StrictMode>
  ),
);
