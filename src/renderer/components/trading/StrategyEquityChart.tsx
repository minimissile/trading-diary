import type { StrategyEquityPoint } from '../../../shared/strategy/types';

export function StrategyEquityChart({ curve }: { curve: StrategyEquityPoint[] }): React.JSX.Element | null {
  if (curve.length < 2) return null;
  const values = curve.flatMap((point) => [point.returnPercent, point.benchmarkPercent]);
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  const padding = Math.max((high - low) * 0.1, 1);
  const bottom = low - padding;
  const top = high + padding;
  const x = (index: number): number => 64 + (index / (curve.length - 1)) * 880;
  const y = (value: number): number => 24 + ((top - value) / (top - bottom)) * 244;
  const line = (field: 'returnPercent' | 'benchmarkPercent'): string =>
    curve.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(point[field]).toFixed(1)}`).join(' ');
  return (
    <figure className="stock-strategy-chart">
      <div className="stock-strategy-chart-legend">
        <span>策略收益</span>
        <span>沪深 300 价格指数</span>
      </div>
      <svg viewBox="0 0 970 310" role="img" aria-label={`策略与沪深 300 收益曲线，${curve[0]!.date} 至 ${curve.at(-1)!.date}`}>
        {Array.from({ length: 5 }, (_, index) => bottom + ((top - bottom) * index) / 4).map((value) => (
          <g key={value}>
            <line x1="64" x2="944" y1={y(value)} y2={y(value)} className="strategy-chart-grid" />
            <text x="52" y={y(value) + 4} textAnchor="end">
              {value.toFixed(1)}%
            </text>
          </g>
        ))}
        <line x1="64" x2="944" y1={y(0)} y2={y(0)} className="strategy-chart-zero" />
        <path d={line('benchmarkPercent')} className="strategy-chart-benchmark" />
        <path d={line('returnPercent')} className="strategy-chart-return" />
        {curve.map((point, index) => (
          <circle key={point.date} cx={x(index)} cy={y(point.returnPercent)} r="5" className="strategy-chart-hit">
            <title>{`${point.date}\n策略 ${point.returnPercent.toFixed(2)}%\n沪深 300 ${point.benchmarkPercent.toFixed(2)}%\n总资产 ¥${point.equity.toFixed(2)}`}</title>
          </circle>
        ))}
        <text x="64" y="300">
          {curve[0]!.date}
        </text>
        <text x="944" y="300" textAnchor="end">
          {curve.at(-1)!.date}
        </text>
      </svg>
      <figcaption>期末按收盘估值，悬停曲线查看每日数据。指数不含分红，策略按复权口径。</figcaption>
    </figure>
  );
}
