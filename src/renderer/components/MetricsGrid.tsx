import { Statistic } from 'antd';
import type { AssetStats, HealthResult } from '../../shared/api.types';

interface MetricsGridProps {
  health: HealthResult | null;
  stats: AssetStats | null;
}

export function MetricsGrid({ health, stats }: MetricsGridProps): React.JSX.Element {
  return (
    <section className="metrics" aria-label="运行状态">
      <article>
        <Statistic title="后台进程 PID" value={health?.servicePid ?? '—'} />
      </article>
      <article>
        <Statistic title="SQLite" value={health?.sqliteVersion ?? '—'} />
      </article>
      <article>
        <Statistic title="数据库结构" value={health ? `v${health.schemaVersion}` : '—'} />
      </article>
      <article>
        <Statistic title="图片" value={stats?.count ?? '—'} />
      </article>
    </section>
  );
}
