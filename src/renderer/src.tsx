import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'dayjs/locale/zh-cn';
import 'antd/dist/antd.css';
import { AppProviders } from './providers/AppProviders';
import { AppRouter } from './router';
import './styles/global.css';

const root = document.getElementById('root');
if (!root) throw new Error('找不到渲染进程根节点');

createRoot(root).render(
  <StrictMode>
    <AppProviders>
      <AppRouter />
    </AppProviders>
  </StrictMode>,
);
