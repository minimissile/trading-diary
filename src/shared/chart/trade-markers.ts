import type { KLineBar, KLinePeriod } from '../market/types';
import type { PortfolioLedgerEntry, PortfolioLedgerSide } from '../portfolio/types';
import { formatNumber } from '../format/number-format';

export type ChartTradeMarkerSide = PortfolioLedgerSide;

export interface ChartTradeMarker {
  id: string;
  accountId: string;
  side: ChartTradeMarkerSide;
  timestamp: number;
  price: number;
  quantity: number;
  fees: number;
  tradeAt: string;
  note: string;
  source: PortfolioLedgerEntry['source'];
  label: string;
  placement: 'above' | 'below';
  color: string;
  tooltip: string;
}

const MARKER_COLORS: Record<ChartTradeMarkerSide, string> = {
  buy: '#ff626f',
  sell: '#42cc8b',
  dividend_reinvest: '#55a9ff',
};

const MARKER_LABELS: Record<ChartTradeMarkerSide, string> = {
  buy: 'B',
  sell: 'S',
  dividend_reinvest: '再',
};

const SIDE_NAMES: Record<ChartTradeMarkerSide, string> = {
  buy: '买入',
  sell: '卖出',
  dividend_reinvest: '分红再投',
};

const SOURCE_NAMES: Record<PortfolioLedgerEntry['source'], string> = {
  manual: '手动',
  csv: '导入',
  plan: '计划',
  sip: '定投',
  ai_import: 'AI导入',
};

function isIntradayPeriod(period: KLinePeriod): boolean {
  return period === '1m' || period === '5m' || period === '15m' || period === '30m' || period === '60m';
}

function periodStepMs(period: KLinePeriod): number {
  switch (period) {
    case '1m':
      return 60_000;
    case '5m':
      return 5 * 60_000;
    case '15m':
      return 15 * 60_000;
    case '30m':
      return 30 * 60_000;
    case '60m':
      return 60 * 60_000;
    case '1d':
      return 86_400_000;
    case '1w':
      return 7 * 86_400_000;
    case '1M':
      return 30 * 86_400_000;
  }
}

const CHINA_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

function toChinaLocalParts(date: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const shifted = new Date(date.getTime() + CHINA_UTC_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

/** 将成交时间对齐到 K 线周期锚点（A 股使用 UTC+8 日历日或分钟粒度）。 */
export function alignTradeTimestamp(tradeAt: string, period: KLinePeriod): number {
  const date = new Date(tradeAt);
  if (Number.isNaN(date.getTime())) return Number.NaN;

  if (isIntradayPeriod(period)) {
    const step = periodStepMs(period);
    return Math.floor(date.getTime() / step) * step;
  }

  const { year, month, day } = toChinaLocalParts(date);
  return Date.UTC(year, month, day) - CHINA_UTC_OFFSET_MS;
}

/** 将标记吸附到已加载 K 线上最近且不晚于成交时刻的一根 bar。 */
export function snapTradeMarkerToBars(marker: ChartTradeMarker, bars: KLineBar[]): ChartTradeMarker | null {
  if (bars.length === 0) return null;

  const sorted = [...bars].sort((left, right) => left.timestamp - right.timestamp);
  let anchor = sorted[0]!;

  for (const bar of sorted) {
    if (bar.timestamp <= marker.timestamp) {
      anchor = bar;
      continue;
    }
    break;
  }

  return {
    ...marker,
    timestamp: anchor.timestamp,
  };
}

function formatQuantity(quantity: number, kind?: PortfolioLedgerEntry['kind']): string {
  const digits = kind === 'otc_fund' ? 2 : 0;
  return `${formatNumber(quantity, { maximumFractionDigits: digits, useGrouping: true })}${kind === 'otc_fund' ? ' 份' : ' 股'}`;
}

function buildTooltip(entry: PortfolioLedgerEntry): string {
  const priceText = formatNumber(entry.price, { maximumFractionDigits: entry.kind === 'otc_fund' ? 4 : 2 });
  const quantityText = formatQuantity(entry.quantity, entry.kind);
  const feeText =
    entry.fees > 0 ? ` · 费 ${formatNumber(entry.fees, { maximumFractionDigits: 2, useGrouping: true })}` : '';
  const noteText = entry.note.trim().length > 0 ? ` · ${entry.note.trim()}` : '';
  const sourceText = SOURCE_NAMES[entry.source];
  return `${SIDE_NAMES[entry.side]} ${quantityText} @ ${priceText}${feeText} · ${sourceText}${noteText}`;
}

function markerPlacement(side: ChartTradeMarkerSide): 'above' | 'below' {
  return side === 'sell' ? 'above' : 'below';
}

/** 持仓流水 → K 线买卖点标记（含买/卖/分红再投，保留账户与来源信息）。 */
export function buildChartTradeMarkers(
  entries: PortfolioLedgerEntry[],
  period: KLinePeriod,
): ChartTradeMarker[] {
  const markers = entries
    .filter((entry) => entry.side === 'buy' || entry.side === 'sell' || entry.side === 'dividend_reinvest')
    .map((entry) => {
      const timestamp = alignTradeTimestamp(entry.tradeAt, period);
      if (!Number.isFinite(timestamp)) return null;

      return {
        id: entry.id,
        accountId: entry.accountId,
        side: entry.side,
        timestamp,
        price: entry.price,
        quantity: entry.quantity,
        fees: entry.fees,
        tradeAt: entry.tradeAt,
        note: entry.note,
        source: entry.source,
        label: MARKER_LABELS[entry.side],
        placement: markerPlacement(entry.side),
        color: MARKER_COLORS[entry.side],
        tooltip: buildTooltip(entry),
      } satisfies ChartTradeMarker;
    })
    .filter((marker): marker is ChartTradeMarker => marker !== null)
    .sort((left, right) => left.timestamp - right.timestamp || left.tradeAt.localeCompare(right.tradeAt));

  return spreadOverlappingMarkerPrices(markers);
}

/** 同一根 K 线、同一方向的多次成交，轻微错开价格避免重叠。 */
export function spreadOverlappingMarkerPrices(markers: ChartTradeMarker[]): ChartTradeMarker[] {
  const groups = new Map<string, ChartTradeMarker[]>();

  for (const marker of markers) {
    const key = `${marker.timestamp}:${marker.side}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(marker);
    groups.set(key, bucket);
  }

  const result: ChartTradeMarker[] = [];
  for (const bucket of groups.values()) {
    bucket.forEach((marker, index) => {
      const center = (bucket.length - 1) / 2;
      const offsetRatio = (index - center) * 0.012;
      result.push({
        ...marker,
        price: marker.price * (1 + offsetRatio),
      });
    });
  }

  return result.sort((left, right) => left.timestamp - right.timestamp || left.tradeAt.localeCompare(right.tradeAt));
}

/** 根据已加载 K 线范围过滤并吸附标记。 */
export function prepareTradeMarkersForBars(
  markers: ChartTradeMarker[],
  bars: KLineBar[],
): ChartTradeMarker[] {
  if (bars.length === 0) return [];

  const minTs = bars[0]!.timestamp;
  const maxTs = bars[bars.length - 1]!.timestamp;

  return markers
    .filter((marker) => marker.timestamp >= minTs - periodStepMs('1d') && marker.timestamp <= maxTs + periodStepMs('1d'))
    .map((marker) => snapTradeMarkerToBars(marker, bars))
    .filter((marker): marker is ChartTradeMarker => marker !== null);
}
