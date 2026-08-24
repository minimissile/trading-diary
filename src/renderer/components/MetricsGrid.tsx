import type { AssetStats, HealthResult } from '../../shared/api.types';

interface MetricsGridProps {
  health: HealthResult | null;
  stats: AssetStats | null;
}

export function MetricsGrid({ health, stats }: MetricsGridProps): React.JSX.Element {
  return (
    <section className="metrics" aria-label="运行状态">
      <article>
        <span>后台进程 PID</span>
        <strong>{health?.servicePid ?? '—'}</strong>
      </article>
      <article>
        <span>SQLite</span>
        <strong>{health?.sqliteVersion ?? '—'}</strong>
      </article>
      <article>
        <span>数据库结构</span>
        <strong>{health ? `v${health.schemaVersion}` : '—'}</strong>
      </article>
      <article>
        <span>图片</span>
        <strong>{stats?.count ?? '—'}</strong>
      </article>
    </section>
  );
}
