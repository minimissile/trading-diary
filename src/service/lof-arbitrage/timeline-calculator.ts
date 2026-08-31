import { nextTradingDay, shiftCalendarDate } from '../../shared/trade-calendar';
import type { LofArbitragePathKind, LofTimelineMilestone } from '../../shared/lof-arbitrage/types';

function milestone(dayOffset: number, label: string, action: string): LofTimelineMilestone {
  return { dayOffset, label, action };
}

/** 由 T 日推算绝对日期里程碑。 */
export function resolveTimelineDates(
  tradeDate: string,
  milestones: LofTimelineMilestone[],
): Array<LofTimelineMilestone & { date: string }> {
  let cursor = tradeDate;
  let lastOffset = 0;
  const dated: Array<LofTimelineMilestone & { date: string }> = [];

  for (const item of milestones) {
    const delta = item.dayOffset - lastOffset;
    for (let step = 0; step < delta; step += 1) {
      cursor = nextTradingDay(cursor);
    }
    lastOffset = item.dayOffset;
    dated.push({ ...item, date: cursor });
  }

  return dated;
}

/** 场内申购 → 场内卖出时间线。 */
export function buildPremiumExchangeTimeline(): LofTimelineMilestone[] {
  return [
    milestone(0, 'T 日', '15:00 前提交场内申购'),
    milestone(1, 'T+1', '份额确认'),
    milestone(2, 'T+2', '场内可卖出'),
  ];
}

/** 场外申购 → 转托管 → 场内卖出时间线。 */
export function buildPremiumOtcTimeline(): LofTimelineMilestone[] {
  return [
    milestone(0, 'T 日', '15:00 前场外申购'),
    milestone(1, 'T+1', '份额确认'),
    milestone(2, 'T+2', '发起转托管'),
    milestone(4, 'T+4', '场内可卖出'),
  ];
}

/** 场内买入 → 赎回时间线。 */
export function buildDiscountTimeline(market: 'SH' | 'SZ'): LofTimelineMilestone[] {
  if (market === 'SH') {
    return [
      milestone(0, 'T 日', '场内买入'),
      milestone(0, 'T 日', '可提交场内赎回（视品种规则）'),
    ];
  }
  return [
    milestone(0, 'T 日', '场内买入'),
    milestone(1, 'T+1', '可提交赎回'),
  ];
}

export function pathLabel(kind: LofArbitragePathKind): string {
  switch (kind) {
    case 'premium_exchange_subscribe':
      return '场内申购 → 卖出';
    case 'premium_otc_subscribe':
      return '场外申购 → 转托管 → 卖出';
    case 'discount_exchange_redeem':
      return '场内买入 → 赎回';
    default:
      return kind;
  }
}

/** 返回今日作为 T 日的字符串（Asia/Shanghai）。 */
export function defaultTradeAnchorDate(asOf = new Date()): string {
  const shanghai = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(asOf);
  return shanghai;
}

/** 估算最早可卖出日（场外申购路径）。 */
export function estimateEarliestSellDateOtcPath(tradeDate: string): string {
  let date = tradeDate;
  for (let i = 0; i < 4; i += 1) {
    date = nextTradingDay(date);
  }
  return date;
}

/** 估算最早可卖出日（场内申购路径）。 */
export function estimateEarliestSellDateExchangePath(tradeDate: string): string {
  let date = tradeDate;
  for (let i = 0; i < 2; i += 1) {
    date = nextTradingDay(date);
  }
  return date;
}

/** 非交易日时将锚点顺延到下一交易日。 */
export function normalizeTradeAnchorDate(date: string, isTradingDayFn: (d: string) => boolean): string {
  if (isTradingDayFn(date)) return date;
  return shiftCalendarDate(date, 1);
}
