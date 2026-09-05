import { registerOverlay, type Chart } from 'klinecharts';
import type { ChartTradeMarker } from '../../../shared/chart/trade-markers';
import { prepareTradeMarkersForBars } from '../../../shared/chart/trade-markers';

export const TRADE_MARKER_OVERLAY_GROUP = 'trade-markers';

export interface TradeMarkerOverlayStyle {
  label: string;
  color: string;
  placement: 'above' | 'below';
  tooltip: string;
}

let overlayRegistered = false;

/** 注册 K 线买卖点 overlay（幂等）。 */
export function ensureTradeMarkerOverlayRegistered(): void {
  if (overlayRegistered) return;

  registerOverlay<TradeMarkerOverlayStyle>({
    name: 'tradeMarker',
    totalStep: 1,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    createPointFigures: ({ overlay, coordinates }) => {
      const style = overlay.extendData;
      if (!style || coordinates.length === 0) return [];

      const { x, y } = coordinates[0]!;
      const offsetY = style.placement === 'above' ? -16 : 16;
      const anchorY = y + offsetY;

      return [
        {
          type: 'circle',
          attrs: { x, y: anchorY, r: 9 },
          styles: {
            style: 'fill',
            color: style.color,
            borderStyle: 'solid',
            borderColor: style.color,
            borderSize: 1,
          },
          ignoreEvent: true,
        },
        {
          type: 'text',
          attrs: {
            x,
            y: anchorY,
            text: style.label,
            align: 'center',
            baseline: 'middle',
          },
          styles: {
            color: '#ffffff',
            backgroundColor: style.color,
            borderSize: 0,
            size: 10,
            weight: '700',
            family: 'Helvetica Neue',
          },
          ignoreEvent: true,
        },
      ];
    },
  });

  overlayRegistered = true;
}

/** 在 K 线图上绘制买卖点标记。 */
export function applyTradeMarkersToChart(
  chart: Chart,
  markers: ChartTradeMarker[],
  options: { visible: boolean },
): void {
  ensureTradeMarkerOverlayRegistered();
  chart.removeOverlay({ groupId: TRADE_MARKER_OVERLAY_GROUP });

  if (!options.visible || markers.length === 0) return;

  const bars = chart.getDataList();
  const prepared = prepareTradeMarkersForBars(markers, bars);
  if (prepared.length === 0) return;

  chart.createOverlay(
    prepared.map((marker) => ({
      name: 'tradeMarker',
      groupId: TRADE_MARKER_OVERLAY_GROUP,
      lock: true,
      zLevel: 7,
      points: [{ timestamp: marker.timestamp, value: marker.price }],
      extendData: {
        label: marker.label,
        color: marker.color,
        placement: marker.placement,
        tooltip: marker.tooltip,
      } satisfies TradeMarkerOverlayStyle,
    })),
  );
}
