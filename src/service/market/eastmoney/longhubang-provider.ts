import { z } from 'zod';
import type {
  LhbEvent,
  LhbExchange,
  LhbPeriod,
  LhbSeat,
  LhbSecurityType,
  LhbInstitution,
} from '../../../shared/longhubang/types';
import { lhbDateSchema } from '../../../shared/schemas/requests/longhubang.requests';
import { eastMoneyFetchJson } from './client';

const LIST_REPORT = 'RPT_DAILYBILLBOARD_DETAILSNEW';
const STOCK_FILTER = '(SECURITY_TYPE_CODE="058001001")';
const typeFilter = (type: LhbSecurityType) =>
  type === 'stock'
    ? STOCK_FILTER
    : type === 'bond'
      ? '(SECURITY_TYPE_CODE="060")'
      : '(SECURITY_TYPE_CODE in ("058001001","060"))';
const payloadSchema = z.object({
  success: z.boolean(),
  code: z.number(),
  message: z.string(),
  result: z
    .object({
      count: z.number().int().nonnegative(),
      pages: z.number().int().nonnegative(),
      data: z.array(z.record(z.string(), z.unknown())),
    })
    .nullable()
    .optional(),
});
const identitySchema = z.object({
  SECURITY_CODE: z.string().regex(/^\d{6}$/u),
  TRADE_DATE: z.string(),
  EXPLANATION: z.string().min(1),
});

function numeric(value: unknown): number | null {
  if (value == null || value === '' || value === '-') return null;
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error('龙虎榜数值字段格式异常');
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error('龙虎榜数值字段格式异常');
  return number;
}

export function lhbMoneyCents(value: unknown): number | null {
  const amount = numeric(value);
  if (amount === null) return null;
  const cents = Math.round(amount * 100);
  if (!Number.isSafeInteger(cents)) throw new Error('龙虎榜金额超出支持范围');
  return cents;
}

export function classifyLhbPeriod(reason: string): LhbPeriod {
  if (/连续|累计|累积|[三五十\d]+个交易日/u.test(reason)) return 'multi';
  if (/日收盘|日涨|日跌|日换手|日振幅|当日|首日/u.test(reason)) return 'daily';
  return 'other';
}

function scalarText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) return String(value);
  throw new Error('龙虎榜标识字段格式异常');
}

function eventId(row: Record<string, unknown>): string {
  return row.TRADE_ID != null
    ? scalarText(row.TRADE_ID)
    : `${scalarText(row.SECURITY_CODE)}:${scalarText(row.TRADE_DATE).slice(0, 10)}:${scalarText(row.CHANGE_TYPE ?? row.EXPLANATION)}`;
}

export function mapLhbEvent(row: Record<string, unknown>): LhbEvent {
  const identity = identitySchema.parse(row);
  const date = lhbDateSchema.parse(identity.TRADE_DATE.slice(0, 10));
  const suffix = scalarText(row.SECUCODE).split('.').at(-1);
  const exchange: LhbExchange = suffix === 'SH' || suffix === 'SZ' || suffix === 'BJ' ? suffix : 'UNKNOWN';
  return {
    board: scalarText(row.TRADE_MARKET),
    securityType: row.SECURITY_TYPE_CODE === '058001001' ? 'stock' : row.SECURITY_TYPE_CODE === '060' ? 'bond' : 'other',
    interpretation: scalarText(row.EXPLAIN),
    dealCents: lhbMoneyCents(row.BILLBOARD_DEAL_AMT),
    marketDealCents: lhbMoneyCents(row.ACCUM_AMOUNT),
    dealRatioPercent: numeric(row.DEAL_AMOUNT_RATIO),
    after1Percent: numeric(row.D1_CLOSE_ADJCHRATE),
    after2Percent: numeric(row.D2_CLOSE_ADJCHRATE),
    after5Percent: numeric(row.D5_CLOSE_ADJCHRATE),
    after10Percent: numeric(row.D10_CLOSE_ADJCHRATE),
    after20Percent: numeric(row.D20_CLOSE_ADJCHRATE),
    after30Percent: numeric(row.D30_CLOSE_ADJCHRATE),
    institutionBuyCount: null,
    institutionSellCount: null,
    institutionBuyCents: null,
    institutionSellCents: null,
    institutionNetCents: null,
    institutionNetRatioPercent: null,
    id: eventId(row),
    symbol: identity.SECURITY_CODE,
    name: z.string().min(1).parse(row.SECURITY_NAME_ABBR),
    exchange,
    date,
    reasonCode: scalarText(row.CHANGE_TYPE),
    reason: identity.EXPLANATION,
    period: classifyLhbPeriod(identity.EXPLANATION),
    close: numeric(row.CLOSE_PRICE),
    changePercent: numeric(row.CHANGE_RATE),
    turnoverPercent: numeric(row.TURNOVERRATE),
    buyCents: lhbMoneyCents(row.BILLBOARD_BUY_AMT),
    sellCents: lhbMoneyCents(row.BILLBOARD_SELL_AMT),
    netCents: lhbMoneyCents(row.BILLBOARD_NET_AMT),
    marketCapCents: lhbMoneyCents(row.FREE_MARKET_CAP),
    netRatioPercent: numeric(row.DEAL_NET_RATIO),
  };
}

export function mapLhbSeats(rows: Record<string, unknown>[], side: 'buy' | 'sell'): LhbSeat[] {
  const ranks = new Map<string, number>();
  return rows.map((row) => {
    identitySchema.parse(row);
    const id = eventId(row);
    const rank = (ranks.get(id) ?? 0) + 1;
    ranks.set(id, rank);
    const buyRatio = numeric(row.TOTAL_BUYRIO);
    const sellRatio = numeric(row.TOTAL_SELLRIO);
    return {
      id: `${id}:${side}:${rank}`,
      eventId: id,
      reasonCode: scalarText(row.CHANGE_TYPE),
      reason: String(row.EXPLANATION),
      side,
      rank,
      departmentCode: scalarText(row.OPERATEDEPT_CODE),
      departmentName: z.string().min(1).parse(row.OPERATEDEPT_NAME),
      buyCents: lhbMoneyCents(row.BUY),
      sellCents: lhbMoneyCents(row.SELL),
      netCents: lhbMoneyCents(row.NET),
      buyRatioPercent: buyRatio === null ? null : buyRatio * 100,
      sellRatioPercent: sellRatio === null ? null : sellRatio * 100,
    };
  });
}

export interface LhbProvider {
  latestDate: () => Promise<string>;
  list: (startDate: string, endDate: string, symbol?: string, securityType?: LhbSecurityType) => Promise<LhbEvent[]>;
  institutions: (startDate: string, endDate: string, symbol?: string) => Promise<LhbInstitution[]>;
  seats: (symbol: string, date: string) => Promise<LhbSeat[]>;
}

/** 所有调用共享两条请求槽；分页未完成或总数变化时不返回部分全集。 */
export class EastMoneyLonghubangProvider implements LhbProvider {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  private async page(params: Record<string, string>, deadline = Date.now() + 24_000) {
    if (this.active >= 2) await new Promise<void>((resolve) => this.queue.push(resolve));
    else this.active++;
    try {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('龙虎榜查询超时，请缩小范围后重试');
      const url = new URL('https://datacenter-web.eastmoney.com/api/data/v1/get');
      const query = { columns: 'ALL', pageSize: '500', pageNumber: '1', source: 'WEB', client: 'WEB', ...params };
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
      const raw = await eastMoneyFetchJson<unknown>(url, {
        referer: 'https://data.eastmoney.com/stock/tradedetail.html',
        signal: AbortSignal.timeout(Math.min(12_000, remaining)),
      });
      const payload = payloadSchema.parse(raw);
      if (!payload.success) {
        if (payload.code === 9201 && payload.result === null && payload.message === '返回数据为空') {
          return { count: 0, pages: 0, data: [] as Record<string, unknown>[] };
        }
        throw new Error(`龙虎榜数据源错误：${payload.message}`);
      }
      if (!payload.result) throw new Error('龙虎榜数据源返回结构异常');
      return payload.result;
    } finally {
      const next = this.queue.shift();
      if (next) next();
      else this.active--;
    }
  }

  private async all(params: Record<string, string>, deadline = Date.now() + 24_000): Promise<Record<string, unknown>[]> {
    const first = await this.page(params, deadline);
    if (first.pages > 100) throw new Error('查询结果过多，请缩小日期范围');
    const rows = [...first.data];
    for (let page = 2; page <= first.pages; page++) {
      const next = await this.page({ ...params, pageNumber: String(page) }, deadline);
      if (next.count !== first.count) throw new Error('龙虎榜数据正在更新，请重新查询');
      rows.push(...next.data);
    }
    if (rows.length !== first.count) throw new Error('龙虎榜数据未完整返回，请重试');
    return rows;
  }

  async latestDate(): Promise<string> {
    const result = await this.page({
      reportName: LIST_REPORT,
      filter: STOCK_FILTER,
      sortColumns: 'TRADE_DATE,SECURITY_CODE',
      sortTypes: '-1,1',
      pageSize: '1',
    });
    if (!result.data[0]) throw new Error('暂时无法获取最新披露日期');
    return lhbDateSchema.parse(String(result.data[0].TRADE_DATE).slice(0, 10));
  }

  async list(startDate: string, endDate: string, symbol?: string, securityType: LhbSecurityType = 'stock'): Promise<LhbEvent[]> {
    const rows = await this.all({
      reportName: LIST_REPORT,
      filter: `${typeFilter(securityType)}(TRADE_DATE>='${startDate}')(TRADE_DATE<='${endDate}')${symbol ? `(SECURITY_CODE="${symbol}")` : ''}`,
      sortColumns: 'TRADE_DATE,SECURITY_CODE,TRADE_ID',
      sortTypes: '-1,1,1',
    });
    const events = rows.map(mapLhbEvent);
    if (
      events.some(
        (event) =>
          event.date < startDate ||
          event.date > endDate ||
          (symbol && event.symbol !== symbol) ||
          event.securityType === 'other' ||
          (securityType !== 'all' && event.securityType !== securityType),
      )
    ) {
      throw new Error('龙虎榜数据源未正确应用查询条件');
    }
    if (new Set(events.map((event) => event.id)).size !== events.length) throw new Error('龙虎榜分页包含重复记录，请重新查询');
    return events;
  }

  async institutions(startDate: string, endDate: string, symbol?: string): Promise<LhbInstitution[]> {
    const rows = await this.all({
      reportName: 'RPT_ORGANIZATION_TRADE_DETAILS',
      filter: `(TRADE_DATE>='${startDate}')(TRADE_DATE<='${endDate}')${symbol ? `(SECURITY_CODE="${symbol}")` : ''}`,
      sortColumns: 'TRADE_DATE,SECURITY_CODE,EXPLANATION',
      sortTypes: '-1,1,1',
    });
    const result = rows.map((row): LhbInstitution => {
      const identity = identitySchema.parse(row);
      const date = lhbDateSchema.parse(identity.TRADE_DATE.slice(0, 10));
      const suffix = scalarText(row.SECUCODE).split('.').at(-1);
      const count = (value: unknown) => {
        const n = numeric(value);
        return n === null ? null : z.number().int().nonnegative().parse(n);
      };
      return {
        symbol: identity.SECURITY_CODE,
        date,
        reason: identity.EXPLANATION,
        exchange: suffix === 'SH' || suffix === 'SZ' || suffix === 'BJ' ? suffix : 'UNKNOWN',
        institutionBuyCount: count(row.BUY_TIMES),
        institutionSellCount: count(row.SELL_TIMES),
        institutionBuyCents: lhbMoneyCents(row.BUY_AMT),
        institutionSellCents: lhbMoneyCents(row.SELL_AMT),
        institutionNetCents: lhbMoneyCents(row.NET_BUY_AMT),
        institutionNetRatioPercent: numeric(row.RATIO),
      };
    });
    if (result.some((row) => row.date < startDate || row.date > endDate || (symbol && row.symbol !== symbol)))
      throw new Error('机构统计未正确应用查询条件');
    const keys = result.map((row) => `${row.exchange}:${row.symbol}:${row.date}:${row.reason}`);
    if (new Set(keys).size !== result.length) throw new Error('机构统计出现重复原因，暂不能可靠关联');
    return result;
  }

  async seats(symbol: string, date: string): Promise<LhbSeat[]> {
    const get = async (side: 'buy' | 'sell') => {
      const rows = await this.all({
        reportName: `RPT_BILLBOARD_DAILYDETAILS${side.toUpperCase()}`,
        filter: `(SECURITY_CODE="${symbol}")(TRADE_DATE='${date}')`,
        sortColumns: side.toUpperCase(),
        sortTypes: '-1',
      });
      if (rows.some((row) => row.SECURITY_CODE !== symbol || String(row.TRADE_DATE).slice(0, 10) !== date)) {
        throw new Error('龙虎榜席位与查询的股票或日期不匹配');
      }
      return mapLhbSeats(rows, side);
    };
    const [buy, sell] = await Promise.all([get('buy'), get('sell')]);
    return [...buy, ...sell];
  }
}
