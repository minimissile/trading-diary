import { MarketProviderError } from '../../../shared/market/errors';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface EastMoneyFetchOptions {
  referer?: string;
  signal?: AbortSignal;
}

async function eastMoneyFetchResponse(url: string | URL, options: EastMoneyFetchOptions = {}): Promise<Response> {
  try {
    const response = await fetch(url.toString(), {
      signal: options.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Referer: options.referer ?? 'https://www.eastmoney.com/',
        Accept: 'application/json, text/plain, */*',
      },
    });
    return response;
  } catch (error) {
    const detail = error instanceof Error ? error.message : '网络错误';
    throw new MarketProviderError(`东方财富网络请求失败：${detail}`);
  }
}

export async function eastMoneyFetchJson<T>(
  url: string | URL,
  options: EastMoneyFetchOptions = {},
): Promise<T> {
  const response = await eastMoneyFetchResponse(url, options);

  if (!response.ok) {
    throw new MarketProviderError(`东方财富 HTTP ${response.status}：${url.toString()}`);
  }

  return response.json() as Promise<T>;
}

/**
 * 依次尝试多个东方财富域名，首个成功响应即返回。
 */
export async function eastMoneyFetchJsonFromOrigins<T>(
  origins: readonly string[],
  buildUrl: (origin: string) => URL,
  options: EastMoneyFetchOptions = {},
): Promise<T> {
  let lastError: unknown;

  for (const origin of origins) {
    try {
      return await eastMoneyFetchJson<T>(buildUrl(origin), options);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof MarketProviderError) throw lastError;
  if (lastError instanceof Error) {
    throw new MarketProviderError(`东方财富 K 线请求失败：${lastError.message}`);
  }
  throw new MarketProviderError('东方财富 K 线请求失败');
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
