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
import './styles/global.css';
import './styles/splash-screen.css';
import './styles/trading-workspace.css';
import './styles/chart.css';

dayjs.locale('zh-cn');

const root = document.getElementById('root');
if (!root) throw new Error('找不到渲染进程根节点');

function AppRoot(): React.JSX.Element {
  const [splashFinished, setSplashFinished] = useState(false);
  const handleSplashFinished = useCallback(() => setSplashFinished(true), []);

  return (
    <SplashScreen onFinished={handleSplashFinished}>
      <AccessLockGate gateActive={splashFinished}>
        <AppRouter />
      </AccessLockGate>
    </SplashScreen>
  );
}

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <AppProviders>
        <DesktopGate>
          <AppRoot />
        </DesktopGate>
      </AppProviders>
    </ErrorBoundary>
  </StrictMode>,
);
