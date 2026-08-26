import type { MarketNewsItem } from '../../../shared/market/types';
import { MarketUnsupportedError } from '../../../shared/market/errors';
import { eastMoneyFetchJson } from './client';
import { resolveInstrument } from './search-service';
import { normalizeSymbol, parseEastMoneyDate, toF10Code } from './symbols';

interface NewsRow {
  title?: string;
  summary?: string;
  uniqueUrl?: string;
  url?: string;
  showDateTime?: string;
}

interface NewsResponse {
  gszx?: {
    data?: {
      items?: NewsRow[];
    };
  };
}

export async function listNews(symbolInput: string, pageSize = 10): Promise<MarketNewsItem[]> {
  const instrument = await resolveInstrument(symbolInput);
  if (instrument.kind === 'otc_fund') {
    return [];
  }

  const f10Code = instrument.f10Code ?? toF10Code(instrument.symbol);
  if (!f10Code) {
    throw new MarketUnsupportedError(`资讯不可用：${normalizeSymbol(symbolInput)}`);
  }

  const url = new URL('https://emweb.securities.eastmoney.com/PC_HSF10/NewsBulletin/PageAjax');
  url.searchParams.set('code', f10Code);
  url.searchParams.set('pageNumber', '1');
  url.searchParams.set('pageSize', String(Math.min(Math.max(pageSize, 1), 20)));

  const payload = await eastMoneyFetchJson<NewsResponse>(url, {
    referer: 'https://emweb.securities.eastmoney.com/',
  });

  const items = payload.gszx?.data?.items ?? [];
  return items.map((item) => ({
    title: item.title ?? '',
    summary: item.summary ?? null,
    url: item.uniqueUrl ?? item.url ?? null,
    publishedAt: parseEastMoneyDate(item.showDateTime),
    source: 'eastmoney-f10',
  }));
}
