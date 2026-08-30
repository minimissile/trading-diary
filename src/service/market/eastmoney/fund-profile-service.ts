import type { EastMoneyFundBasicInfo } from '../../../shared/market/fund-profile';
import { MarketNotFoundError } from '../../../shared/market/errors';
import { eastMoneyFetchJson } from './client';
import { normalizeSymbol } from './symbols';

interface FundBasicInfoResponse {
  Success?: boolean;
  Datas?: EastMoneyFundBasicInfo | null;
}

export async function fetchFundBasicInformation(symbolInput: string): Promise<EastMoneyFundBasicInfo> {
  const symbol = normalizeSymbol(symbolInput);
  const url = new URL('https://fundmobapi.eastmoney.com/FundMNewApi/FundMNNBasicInformation');
  url.searchParams.set('version', '6.2.4');
  url.searchParams.set('plat', 'Android');
  url.searchParams.set('appType', 'ttjj');
  url.searchParams.set('FCODE', symbol);
  url.searchParams.set('onFundCache', '3');
  url.searchParams.set('deviceid', 'trading-diary');
  url.searchParams.set('product', 'EFund');

  const payload = await eastMoneyFetchJson<FundBasicInfoResponse>(url, { referer: 'https://fund.eastmoney.com/' });
  if (!payload.Success || !payload.Datas) {
    throw new MarketNotFoundError(`基金档案不可用：${symbol}`);
  }

  return {
    ...payload.Datas,
    FCODE: payload.Datas.FCODE ?? symbol,
  };
}
