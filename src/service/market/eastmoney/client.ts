import { MarketProviderError } from '../../../shared/market/errors';

const USER_AGENT = 'TradingDiary/1.0';

export interface EastMoneyFetchOptions {
  referer?: string;
  signal?: AbortSignal;
}

export async function eastMoneyFetchJson<T>(
  url: string | URL,
  options: EastMoneyFetchOptions = {},
): Promise<T> {
  const response = await fetch(url.toString(), {
    signal: options.signal,
    headers: {
      'User-Agent': USER_AGENT,
      Referer: options.referer ?? 'https://www.eastmoney.com/',
    },
  });

  if (!response.ok) {
    throw new MarketProviderError(`东方财富 HTTP ${response.status}：${url.toString()}`);
  }

  return response.json() as Promise<T>;
}

export async function eastMoneyFetchText(
  url: string | URL,
  options: EastMoneyFetchOptions = {},
): Promise<string> {
  const response = await fetch(url.toString(), {
    signal: options.signal,
    headers: {
      'User-Agent': USER_AGENT,
      Referer: options.referer ?? 'https://www.eastmoney.com/',
    },
  });

  if (!response.ok) {
    throw new MarketProviderError(`东方财富 HTTP ${response.status}：${url.toString()}`);
  }

  return response.text();
}
