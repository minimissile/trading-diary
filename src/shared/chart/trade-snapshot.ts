import { z } from 'zod';
import type { ChartTradeMarker } from './trade-markers';
import type { KLineBar } from '../market/types';

export const tradeSnapshotInputSchema = z.object({
  accountId: z.string().min(1).max(64),
  symbol: z.string().trim().min(1).max(32),
  name: z.string().max(120),
  venue: z.enum(['SH', 'SZ', 'HK', 'US', 'OTC']),
  kind: z.enum(['stock', 'etf', 'lof', 'otc_fund']),
  side: z.enum(['buy', 'sell']),
  quantity: z.number().finite().positive(),
  price: z.number().finite().positive(),
  fees: z.number().finite().nonnegative(),
  tradeAt: z.string().datetime({ offset: true }),
  editingId: z.string().optional(),
}).strict();

export type TradeSnapshotInput = z.infer<typeof tradeSnapshotInputSchema>;
export interface TradeSnapshotPayload {
  trade: TradeSnapshotInput;
  bars: KLineBar[];
  markers: ChartTradeMarker[];
}

/** Keep an attachment bound to exactly the trade that was pictured. */
export function tradeSnapshotKey(trade: TradeSnapshotInput): string {
  return JSON.stringify([trade.accountId, trade.symbol, trade.venue, trade.kind, trade.side,
    trade.quantity, trade.price, trade.fees, Date.parse(trade.tradeAt)]);
}

export const chartSnapshotSchema = z.string().max(4_000_000)
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/).nullable().optional();
