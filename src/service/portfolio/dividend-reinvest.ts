import type { InstrumentKind } from '../../shared/market/types';
import type { PortfolioDividendRecord } from '../../shared/portfolio/types';
import { marketService } from '../market/market-service';

export interface DividendReinvestPlan {
  quantity: number;
  price: number;
  priceDate: string;
  tradeAt: string;
  note: string;
}

function roundReinvestQuantity(quantity: number, kind: InstrumentKind): number {
  const digits = kind === 'otc_fund' ? 4 : kind === 'stock' ? 0 : 2;
  const factor = 10 ** digits;
  return Math.round(quantity * factor) / factor;
}

/**
 * 根据分红金额与除权/到账日净值，计算红利再投资份额。
 */
export async function buildDividendReinvestPlan(
  record: Pick<
    PortfolioDividendRecord,
    'symbol' | 'kind' | 'cashAmount' | 'exDividendDate' | 'payDate'
  >,
): Promise<DividendReinvestPlan> {
  const priceDate = record.payDate ?? record.exDividendDate;
  const lookup = await marketService.lookupHistoricalPriceOnDate(record.symbol, priceDate);
  if (!lookup || lookup.nav <= 0) {
    throw new Error(`无法获取 ${priceDate} 的历史净值，暂时无法计算红利再投资份额`);
  }

  const quantity = roundReinvestQuantity(record.cashAmount / lookup.nav, record.kind);
  if (quantity <= 0) {
    throw new Error('红利再投资份额计算结果无效');
  }

  return {
    quantity,
    price: lookup.nav,
    priceDate: lookup.navDate,
    tradeAt: `${priceDate}T12:00:00.000Z`,
    note: `红利再投资 · 除权日 ${record.exDividendDate}`,
  };
}
