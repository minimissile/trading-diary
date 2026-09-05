/** 页面、请求校验和服务筛选共用字段目录，单位只在展示层换算。 */
export const LHB_NUMERIC_FILTERS = [
  { field: 'close', label: '收盘价', unit: '元', scale: 1, group: '行情', nonnegative: true },
  { field: 'changePercent', label: '涨跌幅', unit: '%', scale: 1, group: '行情' },
  { field: 'turnoverPercent', label: '换手率', unit: '%', scale: 1, group: '行情', nonnegative: true },
  { field: 'marketCapCents', label: '流通市值', unit: '亿元', scale: 10_000_000_000, group: '行情', nonnegative: true },
  { field: 'netCents', label: '净买额', unit: '万元', scale: 1_000_000, group: '资金' },
  { field: 'buyCents', label: '买入额', unit: '万元', scale: 1_000_000, group: '资金', nonnegative: true },
  { field: 'sellCents', label: '卖出额', unit: '万元', scale: 1_000_000, group: '资金', nonnegative: true },
  { field: 'dealCents', label: '龙虎榜成交额', unit: '万元', scale: 1_000_000, group: '资金', nonnegative: true },
  { field: 'marketDealCents', label: '市场总成交额', unit: '万元', scale: 1_000_000, group: '资金', nonnegative: true },
  { field: 'netRatioPercent', label: '净买额占总成交比', unit: '%', scale: 1, group: '资金' },
  { field: 'dealRatioPercent', label: '龙虎榜成交额占比', unit: '%', scale: 1, group: '资金', nonnegative: true },
  { field: 'institutionBuyCount', label: '买方机构数', unit: '家', scale: 1, group: '机构', nonnegative: true },
  { field: 'institutionSellCount', label: '卖方机构数', unit: '家', scale: 1, group: '机构', nonnegative: true },
  { field: 'institutionBuyCents', label: '机构买入额', unit: '万元', scale: 1_000_000, group: '机构', nonnegative: true },
  { field: 'institutionSellCents', label: '机构卖出额', unit: '万元', scale: 1_000_000, group: '机构', nonnegative: true },
  { field: 'institutionNetCents', label: '机构净买额', unit: '万元', scale: 1_000_000, group: '机构' },
  { field: 'institutionNetRatioPercent', label: '机构净买额占比', unit: '%', scale: 1, group: '机构' },
  ...([1, 2, 5, 10, 20, 30] as const).map((days) => ({
    field: `after${days}Percent` as const,
    label: `上榜后 ${days} 日涨跌幅`,
    unit: '%',
    scale: 1,
    group: '历史表现',
  })),
] as const;
export type LhbNumericField = (typeof LHB_NUMERIC_FILTERS)[number]['field'];
export type LhbRangeKey = `min${Capitalize<LhbNumericField>}` | `max${Capitalize<LhbNumericField>}`;
export function lhbRangeKeys<T extends string>(field: T): [`min${Capitalize<T>}`, `max${Capitalize<T>}`] {
  const name = field.charAt(0).toUpperCase() + field.slice(1);
  return [`min${name}`, `max${name}`] as [`min${Capitalize<T>}`, `max${Capitalize<T>}`];
}
