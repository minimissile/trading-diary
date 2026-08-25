import { Tag } from 'antd';
import type { HealthResult } from '../../shared/api.types';

interface RuntimeHeaderProps {
  health: HealthResult | null;
}

export function RuntimeHeader({ health }: RuntimeHeaderProps): React.JSX.Element {
  return (
    <header>
      <div>
        <p className="eyebrow">工程冒烟验证</p>
        <h1>交易日记</h1>
        <p className="summary">v1.0.1 — 自动更新测试版，用于验证 GitHub Releases 更新流程。</p>
      </div>
      <Tag className="runtime-status" color={health ? 'success' : undefined}>
        {health ? '后台已就绪' : '正在连接'}
      </Tag>
    </header>
  );
}
