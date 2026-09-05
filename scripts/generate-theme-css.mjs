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

// Project controls and Ant Design share the same palette and geometry source.
const { token, components } = themeConfig;
const uiTokens = {
  '--ui-canvas': token.colorBgLayout,
  '--ui-panel': token.colorBgContainer,
  '--ui-inset': token.colorFillAlter,
  '--ui-text': token.colorText,
  '--ui-secondary-text': token.colorTextSecondary,
  '--ui-muted': token.colorTextTertiary,
  '--ui-line': token.colorBorderSecondary,
  '--ui-line-strong': token.colorBorder,
  '--ui-primary': token.colorPrimary,
  '--ui-primary-hover': token.colorPrimaryHover,
  '--ui-accent': token.colorPrimaryText,
  '--ui-secondary': token.colorWarning,
  '--ui-success': token.colorSuccess,
  '--ui-danger': token.colorError,
  '--ui-panel-radius': `${components.Card.borderRadiusLG}px`,
  '--ui-control-radius': `${token.borderRadius}px`,
  '--ui-tab-radius': `${components.Segmented.borderRadius}px`,
  '--ui-panel-shadow': token.boxShadowSecondary,
  '--ui-floating-shadow': token.boxShadow,
  '--td-color-canvas': 'var(--ui-canvas)',
  '--td-color-surface': 'var(--ui-panel)',
  '--td-color-surface-subtle': 'var(--ui-inset)',
  '--td-color-ink': 'var(--ui-text)',
  '--td-color-ink-secondary': 'var(--ui-secondary-text)',
  '--td-color-ink-tertiary': 'var(--ui-muted)',
  '--td-color-line': 'var(--ui-line)',
  '--td-color-border': 'var(--ui-line)',
  '--td-color-line-strong': 'var(--ui-line-strong)',
  '--td-color-accent': 'var(--ui-accent)',
  '--td-color-accent-soft': token.colorPrimaryBg,
  '--td-color-violet': 'var(--ui-secondary)',
  '--td-color-warning': 'var(--ui-secondary)',
  '--td-radius-panel': 'var(--ui-panel-radius)',
  '--td-radius-control': 'var(--ui-control-radius)',
  '--td-shadow-panel': 'var(--ui-panel-shadow)',
  '--td-shadow-floating': 'var(--ui-floating-shadow)',
  '--td-select-dropdown-bg': token.colorBgElevated,
  '--td-select-option-hover-bg': components.Select.optionActiveBg,
  '--td-select-option-hover-color': token.colorText,
  '--td-select-option-selected-bg': components.Select.optionSelectedBg,
  '--td-select-option-selected-color': '#ffffff',
  '--yingji-canvas': 'var(--ui-canvas)',
  '--yingji-surface': 'var(--ui-panel)',
  '--yingji-text': 'var(--ui-text)',
  '--yingji-muted': 'var(--ui-secondary-text)',
  '--yingji-subtle': 'var(--ui-muted)',
  '--yingji-border': 'var(--ui-line)',
  '--yingji-border-strong': 'var(--ui-line-strong)',
  '--yingji-primary': 'var(--ui-primary)',
  '--yingji-violet': 'var(--ui-secondary)',
  '--yingji-glass-strong': token.colorBgElevated,
  '--yingji-panel-shadow': 'var(--ui-panel-shadow)',
  '--yingji-soft-shadow': 'var(--ui-panel-shadow)',
};
fs.writeFileSync(
  path.resolve(scriptDirectory, '../src/renderer/styles/ui-tokens.css'),
  `${banner}:root {\n${Object.entries(uiTokens)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n')}\n}\n`,
  'utf8',
);
