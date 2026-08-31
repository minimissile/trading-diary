import { eastMoneyFetchText } from '../market/eastmoney/client';
import type { FundTradingGateStatus } from '../../shared/lof-arbitrage/types';

interface FundNavStatusRow {
  FSRQ?: string;
  DWJZ?: string;
  SGZT?: string;
  SHZT?: string;
}

interface FundNavStatusResponse {
  Data?: { LSJZList?: FundNavStatusRow[] };
  ErrCode?: number;
}

/** 将 F10 申赎状态文案映射为结构化状态。 */
export function mapFundTradingGateStatus(label: string | null | undefined): FundTradingGateStatus {
  const text = label?.trim() ?? '';
  if (!text) return 'unknown';
  if (text.includes('暂停')) return 'paused';
  if (text.includes('限购') || text.includes('限制')) return 'limited';
  if (text.includes('开放') || text.includes('正常')) return 'open';
  return 'unknown';
}

export interface FundTradingStatus {
  navDate: string | null;
  publishedNav: number | null;
  subscriptionStatus: FundTradingGateStatus;
  subscriptionStatusLabel: string | null;
  redemptionStatus: FundTradingGateStatus;
  redemptionStatusLabel: string | null;
}

/**
 * 读取基金最新净值与申赎状态（东方财富 F10）。
 * @param symbol 6 位基金代码
 */
export async function fetchFundTradingStatus(symbol: string): Promise<FundTradingStatus> {
  const url = new URL('https://api.fund.eastmoney.com/f10/lsjz');
  url.searchParams.set('fundCode', symbol.trim());
  url.searchParams.set('pageIndex', '1');
  url.searchParams.set('pageSize', '1');

  const text = await eastMoneyFetchText(url, {
    referer: `https://fundf10.eastmoney.com/jjgz/${symbol.trim()}.html`,
  });

  const trimmed = text.trim();
  const payload: FundNavStatusResponse = trimmed.startsWith('{')
    ? (JSON.parse(trimmed) as FundNavStatusResponse)
    : { Data: undefined };

  const row = payload.Data?.LSJZList?.[0];
  if (!row) {
    return {
      navDate: null,
      publishedNav: null,
      subscriptionStatus: 'unknown',
      subscriptionStatusLabel: null,
      redemptionStatus: 'unknown',
      redemptionStatusLabel: null,
    };
  }

  const publishedNav = row.DWJZ ? Number.parseFloat(row.DWJZ) : null;

  return {
    navDate: row.FSRQ ?? null,
    publishedNav: publishedNav !== null && Number.isFinite(publishedNav) ? publishedNav : null,
    subscriptionStatus: mapFundTradingGateStatus(row.SGZT),
    subscriptionStatusLabel: row.SGZT ?? null,
    redemptionStatus: mapFundTradingGateStatus(row.SHZT),
    redemptionStatusLabel: row.SHZT ?? null,
  };
}
