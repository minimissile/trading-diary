import { describe, expect, it } from 'vitest';
import { getReleasePageUrl, getUpdateDeliveryMode } from '../src/main/updater/update-policy';

describe('更新交付策略', () => {
  it('macOS 使用 GitHub Release 手动更新', () => {
    expect(getUpdateDeliveryMode('darwin')).toBe('manual');
  });

  it('Windows 保留应用内自动更新', () => {
    expect(getUpdateDeliveryMode('win32')).toBe('automatic');
  });

  it('只生成项目内固定的版本下载页', () => {
    expect(getReleasePageUrl('v1.2.1')).toBe('https://github.com/minimissile/trading-diary/releases/tag/v1.2.1');
  });
});
