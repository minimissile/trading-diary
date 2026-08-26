import react from '@vitejs/plugin-react';
import { cpSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';

function copyServiceAssetsPlugin(): Plugin {
  return {
    name: 'copy-service-assets',
    closeBundle() {
      const serviceOut = resolve('out/service');
      mkdirSync(resolve(serviceOut, 'prompts'), { recursive: true });
      mkdirSync(resolve(serviceOut, 'config'), { recursive: true });
      cpSync(resolve('src/prompts'), resolve(serviceOut, 'prompts'), { recursive: true });
      cpSync(resolve('config/llm.defaults.json'), resolve(serviceOut, 'config/llm.defaults.json'));
    },
  };
}

/** Vite 开发态会把 CSS 注入为 inline style，需临时放宽 CSP。生产构建仍走外链 CSS。 */
function devRendererCspPlugin(): Plugin {
  return {
    name: 'dev-renderer-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace(
        "style-src 'self' 'nonce-trading-diary-antd'",
        "style-src 'self' 'unsafe-inline'",
      );
    },
  };
}

export default defineConfig({
  main: {
    build: {
      // 原生扩展必须保持外部依赖，electron-builder 才能打包对应平台的二进制文件。
      // 使用 ?modulePath 导入的后台服务模块会由 electron-vite 5 自动构建为独立入口。
      rollupOptions: {
        external: ['electron-updater', 'sharp'],
      },
    },
    plugins: [copyServiceAssetsPlugin()],
  },
  preload: {
    build: {
      // 沙箱化 preload 无法在运行时解析任意 npm 包，因此除 Electron 和 Node.js
      // 内置模块外，其余依赖全部打进 preload 产物。
      externalizeDeps: false,
    },
  },
  renderer: {
    plugins: [devRendererCspPlugin(), react()],
    build: {
      target: 'chrome150',
    },
  },
});
