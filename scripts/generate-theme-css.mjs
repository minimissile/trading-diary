import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractStyle } from '@ant-design/static-style-extract';
import { ConfigProvider } from 'antd';
import React from 'react';
import themeConfig from '../src/renderer/theme/theme-config.json' with { type: 'json' };

// 静态提取工具会遍历组件，生产模式可避免输出组件自身的废弃 API 警告。
process.env.NODE_ENV = 'production';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(scriptDirectory, '../src/renderer/styles/antd-theme.css');

const css = extractStyle({
  customTheme: (node) => React.createElement(ConfigProvider, { theme: themeConfig }, node),
});

const banner = '/* 此文件由 npm run theme:generate 自动生成，请修改 src/renderer/theme/theme-config.json。 */\n';

fs.writeFileSync(outputPath, `${banner}${css}\n`, 'utf8');
console.info(`Ant Design 静态主题已生成：${path.relative(process.cwd(), outputPath)}`);
