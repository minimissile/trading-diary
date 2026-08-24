import type { HealthResult } from '../../shared/api.types';

interface RuntimeHeaderProps {
  health: HealthResult | null;
}

export function RuntimeHeader({ health }: RuntimeHeaderProps): React.JSX.Element {
  return (
    <header>
      <div>
        <p className="eyebrow">工程冒烟验证</p>
        <h1>桌面运行时</h1>
        <p className="summary">用于验证 React、类型化 IPC、后台进程、SQLite 和图片仓库。</p>
      </div>
      <span className={health ? 'status status--ready' : 'status'}>
        {health ? '后台已就绪' : '正在连接'}
      </span>
    </header>
  );
}
