import { eastMoneyFetchJson } from '../market/eastmoney/client';
import { eastMoneyPushUrl } from '../market/eastmoney/endpoints';
import { asNumber, detectExchangeMarket } from '../market/eastmoney/symbols';

interface LofListRow {
  f2?: number;
  f3?: number;
  f5?: number;
  f6?: number;
  f12?: string;
  f14?: string;
}

interface LofListResponse {
  rc: number;
  data?: { total?: number; diff?: LofListRow[] };
}

export interface LofSpotRow {
  symbol: string;
  name: string;
  market: 'SH' | 'SZ';
  marketPrice: number | null;
  changePercent: number | null;
  volume: number | null;
  amount: number | null;
}

const LOF_LIST_FS = 'b:MK0025';
const LOF_PAGE_SIZE = 100;
const LOF_MAX_PAGES = 5;

/**
 * 拉取东方财富 LOF 场内列表（b:MK0025）。
 * @param limit 最多返回条数
 */
export async function scanLofMarket(limit = 200): Promise<LofSpotRow[]> {
  const rows: LofSpotRow[] = [];
  let page = 1;

  while (rows.length < limit && page <= LOF_MAX_PAGES) {
    const url = eastMoneyPushUrl('/api/qt/clist/get');
    url.searchParams.set('pn', String(page));
    url.searchParams.set('pz', String(LOF_PAGE_SIZE));
    url.searchParams.set('po', '1');
    url.searchParams.set('np', '1');
    url.searchParams.set('fltt', '2');
    url.searchParams.set('invt', '2');
    url.searchParams.set('fid', 'f3');
    url.searchParams.set('fs', LOF_LIST_FS);
    url.searchParams.set('fields', 'f2,f3,f5,f6,f12,f14');

    const payload = await eastMoneyFetchJson<LofListResponse>(url);
    const batch = payload.rc === 0 ? (payload.data?.diff ?? []) : [];
    if (batch.length === 0) break;

    for (const item of batch) {
      const symbol = item.f12?.trim();
      if (!symbol) continue;
      const market = detectExchangeMarket(symbol);
      if (market !== 'SH' && market !== 'SZ') continue;

      rows.push({
        symbol,
        name: item.f14?.trim() ?? symbol,
        market,
        marketPrice: asNumber(item.f2),
        changePercent: asNumber(item.f3) !== null ? asNumber(item.f3)! / 100 : null,
        volume: asNumber(item.f5),
        amount: asNumber(item.f6),
      });

      if (rows.length >= limit) break;
    }

    if (batch.length < LOF_PAGE_SIZE) break;
    page += 1;
  }

  return rows;
}
