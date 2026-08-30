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
  if (kind === 'otc_fund') {
    // 对齐主流基金 App：红利再投份额保留 2 位小数且向下取整
    return Math.floor(quantity * 100) / 100;
  }
  const digits = kind === 'stock' ? 0 : 2;
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
  // 场外基金再投份额按除权日净值折算（与支付宝/天天基金一致）
  const priceDate =
    record.kind === 'otc_fund' ? record.exDividendDate : (record.payDate ?? record.exDividendDate);
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
