import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppRouter } from './router';
import './styles/global.css';

const root = document.getElementById('root');
if (!root) throw new Error('找不到渲染进程根节点');

createRoot(root).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
);
