import type { Dayjs } from 'dayjs';
import type { MarketQuote } from '../../../shared/api.types';
import { formatPrice } from '../../lib/trading-format';

interface TradePriceContextChartProps {
  tradePrice: number;
  tradeAt: Dayjs;
  quote: MarketQuote | null;
}

interface RangeMarker {
  key: string;
  value: number;
  label: string;
  tone: 'neutral' | 'trade' | 'reference';
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/**
 * 在当日价格区间内标注成交价相对位置，供成交后复盘对照。
 */
export function TradePriceContextChart({
  tradePrice,
  tradeAt,
  quote,
}: TradePriceContextChartProps): React.JSX.Element {
  const tradeDate = tradeAt.format('YYYY-MM-DD');
  const tradeClock = tradeAt.format('HH:mm');

  if (!quote?.high || !quote.low || quote.high <= quote.low) {
    return (
      <div className="trade-price-chart trade-price-chart--empty">
        <small>
          {tradeDate} {tradeClock} · 成交价 {formatPrice(tradePrice)}
        </small>
        <p>暂无当日高低价，无法绘制价格区间图</p>
      </div>
    );
  }

  const rangeMin = Math.min(quote.low, quote.high, tradePrice, quote.open ?? quote.low, quote.prevClose ?? quote.low);
  const rangeMax = Math.max(quote.low, quote.high, tradePrice, quote.open ?? quote.high, quote.prevClose ?? quote.high);
  const span = rangeMax - rangeMin || 1;

  const toPercent = (value: number): number => clampPercent(((value - rangeMin) / span) * 100);

  const markers: RangeMarker[] = [
    ...(quote.prevClose !== null ? [{ key: 'prev', value: quote.prevClose, label: '昨收', tone: 'reference' as const }] : []),
    ...(quote.open !== null ? [{ key: 'open', value: quote.open, label: '开盘', tone: 'reference' as const }] : []),
    { key: 'trade', value: tradePrice, label: '成交价', tone: 'trade' as const },
    { key: 'low', value: quote.low, label: '最低', tone: 'neutral' as const },
    { key: 'high', value: quote.high, label: '最高', tone: 'neutral' as const },
  ];

  const uniqueMarkers = markers.filter(
    (marker, index, list) => list.findIndex((item) => Math.abs(item.value - marker.value) < 0.0001) === index,
  );

  return (
    <div className="trade-price-chart">
      <div className="trade-price-chart-head">
        <strong>成交价格位置</strong>
        <span>
          {tradeDate} {tradeClock} · 参考最新交易日行情
        </span>
      </div>
      <div className="trade-price-chart-track" aria-hidden="true">
        <i className="trade-price-chart-fill" />
        {uniqueMarkers.map((marker) => (
          <span
            key={marker.key}
            className={`trade-price-chart-marker trade-price-chart-marker--${marker.tone}`}
            style={{ left: `${toPercent(marker.value)}%` }}
            title={`${marker.label} ${formatPrice(marker.value)}`}
          />
        ))}
      </div>
      <div className="trade-price-chart-labels">
        <span>低 {formatPrice(quote.low)}</span>
        <span>高 {formatPrice(quote.high)}</span>
      </div>
      <ul className="trade-price-chart-legend">
        {uniqueMarkers.map((marker) => (
          <li key={`legend-${marker.key}`}>
            <i className={`trade-price-chart-dot trade-price-chart-dot--${marker.tone}`} />
            {marker.label} {formatPrice(marker.value)}
          </li>
        ))}
      </ul>
    </div>
  );
}
