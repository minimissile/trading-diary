import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import './styles/antd-theme.css';
import './styles/theme.css';
import { AppProviders } from './providers/AppProviders';
import { AppRouter } from './router';
import { DesktopGate } from './components/DesktopGate';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/global.css';
import './styles/trading-workspace.css';

dayjs.locale('zh-cn');

const root = document.getElementById('root');
if (!root) throw new Error('找不到渲染进程根节点');

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <AppProviders>
        <DesktopGate>
          <AppRouter />
        </DesktopGate>
      </AppProviders>
    </ErrorBoundary>
  </StrictMode>,
);
