import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: {
    build: {
      // 原生扩展必须保持外部依赖，electron-builder 才能打包对应平台的二进制文件。
      // 使用 ?modulePath 导入的后台服务模块会由 electron-vite 5 自动构建为独立入口。
      rollupOptions: {
        external: ['sharp'],
      },
    },
  },
  preload: {
    build: {
      // 沙箱化 preload 无法在运行时解析任意 npm 包，因此除 Electron 和 Node.js
      // 内置模块外，其余依赖全部打进 preload 产物。
      externalizeDeps: false,
    },
  },
  renderer: {
    plugins: [react()],
    build: {
      target: 'chrome150',
    },
  },
});
