import { MarketProviderError } from '../../../shared/market/errors';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

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

export async function eastMoneyPostForm<T>(
  url: string | URL,
  body: Record<string, string>,
  options: EastMoneyFetchOptions = {},
): Promise<T> {
  const response = await fetch(url.toString(), {
    method: 'POST',
    signal: options.signal,
    headers: {
      'User-Agent': USER_AGENT,
      Referer: options.referer ?? 'https://fund.eastmoney.com/',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
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

/**
 * 解析东方财富 JSONP 响应。
 * @param text 原始响应文本
 */
export function parseEastMoneyJsonp<T>(text: string): T {
  const start = text.indexOf('(');
  const end = text.lastIndexOf(')');
  if (start < 0 || end <= start) {
    throw new MarketProviderError('东方财富 JSONP 响应格式无效');
  }
  return JSON.parse(text.slice(start + 1, end)) as T;
}
