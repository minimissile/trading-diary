/** 东方财富实时行情域名（push2 在部分网络下会空响应，delay 节点更稳定）。 */
export const EASTMONEY_PUSH_ORIGIN = 'https://push2delay.eastmoney.com';

export const EASTMONEY_QUOTE_REFERER = 'https://quote.eastmoney.com/';

/** 东方财富历史 K 线域名（push2his 主域名在部分网络下会被空响应/断连，需轮询 CDN 节点）。 */
export const EASTMONEY_KLINE_ORIGINS: readonly string[] = [
  'https://push2his.eastmoney.com',
  ...Array.from({ length: 15 }, (_, index) => `https://${index + 61}.push2his.eastmoney.com`),
];

const KLINE_PATH = '/api/qt/stock/kline/get';

export function eastMoneyPushUrl(path: string): URL {
  return new URL(path, EASTMONEY_PUSH_ORIGIN);
}

export function eastMoneyKlineUrl(origin: string, searchParams: Record<string, string>): URL {
  const url = new URL(KLINE_PATH, origin);
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }
  return url;
}
