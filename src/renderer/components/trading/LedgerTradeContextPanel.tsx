import { Skeleton } from 'antd';
import type { Dayjs } from 'dayjs';
import type { InstrumentInfo, MarketQuote } from '../../../shared/api.types';
import { changeClass, formatCurrency, formatPercent, formatPrice } from '../../lib/trading-format';
import { TradePriceContextChart } from './TradePriceContextChart';

const kindLabels: Record<string, string> = {
  stock: 'A股',
  etf: 'ETF',
  lof: 'LOF',
  otc_fund: '场外基金',
};

interface LedgerTradeContextPanelProps {
  instrument: InstrumentInfo;
  quote: MarketQuote | null;
  quoteLoading: boolean;
  side: 'buy' | 'sell';
  price?: number;
  quantity?: number;
  tradeAt?: Dayjs;
}

/** 标的摘要、市值与成交价格区间提示。 */
export function LedgerTradeContextPanel({
  instrument,
  quote,
  quoteLoading,
  side,
  price,
  quantity,
  tradeAt,
}: LedgerTradeContextPanelProps): React.JSX.Element {
  const hasTradeInputs = typeof price === 'number' && price > 0 && typeof quantity === 'number' && quantity > 0;
  const tradeAmount = hasTradeInputs ? price * quantity : null;
  const marketValue = quote?.price !== null && quote?.price !== undefined && hasTradeInputs ? quote.price * quantity : null;
  const priceDelta =
    quote?.price !== null && quote?.price !== undefined && hasTradeInputs ? ((quote.price - price) / price) * 100 : null;

  return (
    <section className="ledger-trade-context">
      <header className="ledger-trade-context-head">
        <div>
          <strong>{instrument.name}</strong>
          <span>
            {instrument.symbol} · {kindLabels[instrument.kind] ?? instrument.kind}
          </span>
        </div>
        {quoteLoading ? (
          <Skeleton.Input active size="small" style={{ width: 120 }} />
        ) : quote?.price !== null && quote?.price !== undefined ? (
          <div className="ledger-trade-context-quote">
            <span>现价 {formatPrice(quote.price)}</span>
            <span className={changeClass(quote.changePercent)}>{formatPercent(quote.changePercent)}</span>
          </div>
        ) : (
          <span className="ledger-trade-context-muted">暂无行情</span>
        )}
      </header>

      <div className="ledger-trade-context-metrics">
        <article>
          <small>{side === 'buy' ? '买入金额' : '卖出金额'}</small>
          <strong>{tradeAmount === null ? '—' : formatCurrency(tradeAmount)}</strong>
        </article>
        <article>
          <small>现价市值</small>
          <strong>{marketValue === null ? '—' : formatCurrency(marketValue)}</strong>
        </article>
        <article>
          <small>{side === 'buy' ? '相对现价' : '卖出相对现价'}</small>
          <strong className={changeClass(priceDelta)}>{priceDelta === null ? '—' : formatPercent(priceDelta)}</strong>
        </article>
      </div>

      {hasTradeInputs && tradeAt ? (
        <TradePriceContextChart tradePrice={price} tradeAt={tradeAt} quote={quote} />
      ) : null}
    </section>
  );
}
