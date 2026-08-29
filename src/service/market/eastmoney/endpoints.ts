/** 东方财富实时行情域名（push2 在部分网络下会空响应，delay 节点更稳定）。 */
export const EASTMONEY_PUSH_ORIGIN = 'https://push2delay.eastmoney.com';

export const EASTMONEY_QUOTE_REFERER = 'https://quote.eastmoney.com/';

export function eastMoneyPushUrl(path: string): URL {
  return new URL(path, EASTMONEY_PUSH_ORIGIN);
}
