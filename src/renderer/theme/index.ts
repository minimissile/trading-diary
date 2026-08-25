import type { ThemeConfig } from 'antd';
import themeSource from './theme-config.json';

export { chartColors, marketColors } from './market-colors';
export type { MarketDirection } from './market-colors';

/**
 * Ant Design 运行时主题配置。
 * Token 的单一数据源是 theme-config.json，构建脚本也使用同一份数据生成静态 CSS。
 */
export const appTheme: ThemeConfig = {
  ...themeSource,
  zeroRuntime: true,
};
