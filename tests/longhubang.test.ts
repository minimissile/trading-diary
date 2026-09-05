import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import type { LhbEvent } from '../src/shared/longhubang/types';
import { lhbCalendarRange, shiftLhbCalendar } from '../src/shared/longhubang/calendar';
import { LHB_NUMERIC_FILTERS, lhbRangeKeys } from '../src/shared/longhubang/filters';
import { lhbQuerySchema } from '../src/shared/schemas/requests/longhubang.requests';
import {
  EastMoneyLonghubangProvider,
  lhbMoneyCents,
  mapLhbEvent,
  mapLhbSeats,
  type LhbProvider,
} from '../src/service/market/eastmoney/longhubang-provider';
import { LonghubangDatabase } from '../src/service/longhubang/longhubang-database';
import { LonghubangService } from '../src/service/longhubang/longhubang-service';
import { migrations } from '../src/service/database/migrations';
import * as http from '../src/service/market/eastmoney/client';

const date = '2024-01-05';
const request = { startDate: date, endDate: date };
const raw = (id: number, extra: Record<string, unknown> = {}) => ({
  TRADE_ID: id,
  SECURITY_CODE: '000892',
  SECURITY_TYPE_CODE: '058001001',
  SECURITY_NAME_ABBR: '测试股票',
  SECUCODE: '000892.SZ',
  TRADE_DATE: `${date} 00:00:00`,
  EXPLANATION: '日换手率达到20%的前5只证券',
  CHANGE_TYPE: 'daily',
  BILLBOARD_BUY_AMT: 80_000_000.01,
  BILLBOARD_SELL_AMT: 20_000_000,
  BILLBOARD_NET_AMT: 60_000_000.01,
  CHANGE_RATE: 10.03,
  TURNOVERRATE: 22,
  ...extra,
});
const event = (id: number, extra: Partial<LhbEvent> = {}) => ({ ...mapLhbEvent(raw(id)), ...extra });
const databases: DatabaseSync[] = [];
function setup(
  events = [event(1), event(2, { netCents: -1000 }), event(3, { symbol: '600077', exchange: 'SH', netCents: 20_000_000_000 })],
) {
  const db = new DatabaseSync(':memory:');
  databases.push(db);
  const migration = migrations.find((item) => item.name === 'longhubang_query_cache');
  if (!migration) throw new Error('缺少缓存迁移');
  db.exec(migration.sql);
  const cache = new LonghubangDatabase(db);
  const provider: LhbProvider = {
    list: vi.fn(() => Promise.resolve(events)),
    latestDate: vi.fn(() => Promise.resolve(date)),
    seats: vi.fn(() => Promise.resolve([])),
    institutions: vi.fn(() => Promise.resolve([])),
  };
  const clock = { now: Date.parse('2024-01-06T00:00:00Z') };
  return { db, cache, provider, clock, service: new LonghubangService(cache, provider, () => clock.now) };
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const db of databases.splice(0)) db.close();
});

describe('龙虎榜口径和请求校验', () => {
  it('金额转整数分，百分比保持原尺度，北交所独立识别', () => {
    const result = mapLhbEvent(raw(1, { SECUCODE: '920071.BJ', SECURITY_CODE: '920071' }));
    expect(result.exchange).toBe('BJ');
    expect(result.buyCents).toBe(8_000_000_001);
    expect(result.changePercent).toBe(10.03);
    expect(result.marketCapCents).toBeNull();
    expect(lhbMoneyCents('-')).toBeNull();
    expect(() => lhbMoneyCents(Number.MAX_SAFE_INTEGER)).toThrow('超出');
    expect(mapLhbEvent(raw(2, { EXPLANATION: '连续三个交易日内涨幅偏离值累计达到20%' })).period).toBe('multi');
  });
  it('同名席位、多原因、买卖两榜保持独立，组内排名重新开始', () => {
    const seat = {
      OPERATEDEPT_CODE: 'org',
      OPERATEDEPT_NAME: '机构专用',
      BUY: 100.01,
      SELL: null,
      NET: null,
      TOTAL_BUYRIO: 0.0345,
    };
    const buy = mapLhbSeats([raw(1, seat), raw(2, seat), raw(1, seat)], 'buy');
    const sell = mapLhbSeats([raw(1, seat)], 'sell');
    expect(buy.map((item) => item.rank)).toEqual([1, 1, 2]);
    expect(new Set([...buy, ...sell].map((item) => item.id)).size).toBe(4);
    expect(buy[0]?.buyRatioPercent).toBeCloseTo(3.45);
    expect(buy[0]?.sellCents).toBeNull();
    expect(buy[0]?.netCents).toBeNull();
  });
  it('拒绝无效日期、逆序范围、代码注入和金额逆序；代码查询可跨年', () => {
    expect(lhbQuerySchema.safeParse({ ...request, startDate: '2024-02-30' }).success).toBe(false);
    expect(lhbQuerySchema.safeParse({ ...request, startDate: '2024-01-06' }).success).toBe(false);
    expect(lhbQuerySchema.safeParse({ ...request, symbol: '000892")' }).success).toBe(false);
    expect(lhbQuerySchema.safeParse({ ...request, minNetCents: 10, maxNetCents: 5 }).success).toBe(false);
    expect(lhbQuerySchema.safeParse({ startDate: '2020-01-01', endDate: date }).success).toBe(false);
    expect(lhbQuerySchema.safeParse({ startDate: '2020-01-01', endDate: date, symbol: '000892' }).success).toBe(true);
    expect(lhbQuerySchema.safeParse({ startDate: '2024-01-01', endDate: '2024-01-31' }).success).toBe(true);
  });
});

describe('龙虎榜完整范围查询和缓存', () => {
  it('先过滤再分页，统计去重股票，不累加不同原因金额', async () => {
    const { service, provider } = setup();
    const first = await service.query({ ...request, minNetCents: 0, pageSize: 1, sort: 'net' });
    const second = await service.query({ ...request, minNetCents: 0, pageSize: 1, page: 2, sort: 'net' });
    expect(first.total).toBe(2);
    expect(first.summary).toEqual({ securities: 2, tradingDays: 1 });
    expect(first.items[0]?.id).toBe('3');
    expect(second.items[0]?.id).toBe('1');
    expect(provider.list).toHaveBeenCalledTimes(1);
    const sameStock = await service.query({ ...request, keyword: '000892' });
    expect(sameStock.total).toBe(2);
    expect(sameStock.summary.securities).toBe(1);
  });
  it('负净买入与缺失值不混淆，缺失值升降序均排最后', async () => {
    const { service } = setup([event(1, { netCents: null }), event(2, { netCents: -10 }), event(3, { netCents: 10 })]);
    expect((await service.query({ ...request, sort: 'net', order: 'asc' })).items.map((row) => row.id)).toEqual(['2', '3', '1']);
    expect((await service.query({ ...request, maxNetCents: 0 })).items.map((row) => row.id)).toEqual(['2']);
  });
  it('刷新失败保留完整缓存与抓取时间；新范围失败不能伪装为空', async () => {
    const { service, provider, cache } = setup();
    const original = await service.query(request);
    vi.mocked(provider.list).mockRejectedValue(new Error('连接超时'));
    const fallback = await service.query({ ...request, refresh: true });
    expect(fallback.stale).toBe(true);
    expect(fallback.fetchedAt).toBe(original.fetchedAt);
    expect(fallback.total).toBe(original.total);
    expect(fallback.warning).toContain('连接超时');
    await expect(service.query({ startDate: '2024-01-04', endDate: '2024-01-04' })).rejects.toThrow('连接超时');
    expect(cache.read('events:2024-01-04:2024-01-04:all')).toBeNull();
  });
  it('空结果短期缓存，后续披露能重新取到；并发查询只发一次请求', async () => {
    const { service, provider, clock } = setup([]);
    const [a, b] = await Promise.all([service.query(request), service.query(request)]);
    expect(a.total + b.total).toBe(0);
    expect(provider.list).toHaveBeenCalledTimes(1);
    clock.now += 6 * 60_000;
    vi.mocked(provider.list).mockResolvedValue([event(1)]);
    expect((await service.query(request)).total).toBe(1);
  });
  it('缓存保存归一化金额，整数分写入后精度不变', async () => {
    const { service, db } = setup();
    await service.query(request);
    const row = db.prepare('SELECT payload_json FROM lhb_query_cache').get() as { payload_json: string };
    const stored = JSON.parse(row.payload_json) as LhbEvent[];
    expect(stored[0]?.buyCents).toBe(8_000_000_001);
  });
});

describe('东方财富响应边界', () => {
  it('只把明确的 9201 空数据状态视为空，其他上游失败必须报错', async () => {
    const fetch = vi.spyOn(http, 'eastMoneyFetchJson');
    const provider = new EastMoneyLonghubangProvider();
    fetch.mockResolvedValueOnce({ success: false, code: 9201, message: '返回数据为空', result: null });
    expect(await provider.list(date, date)).toEqual([]);
    fetch.mockResolvedValueOnce({ success: false, code: 500, message: '参数错误', result: null });
    await expect(provider.list(date, date)).rejects.toThrow('参数错误');
  });
  it('分页有缺失或重复时拒绝返回部分全集', async () => {
    const fetch = vi.spyOn(http, 'eastMoneyFetchJson');
    const provider = new EastMoneyLonghubangProvider();
    const payload = (data: unknown[], pages: number) => ({
      success: true,
      code: 0,
      message: 'ok',
      result: { count: 2, pages, data },
    });
    fetch.mockResolvedValueOnce(payload([raw(1)], 2)).mockResolvedValueOnce(payload([], 2));
    await expect(provider.list(date, date)).rejects.toThrow('未完整');
    fetch.mockResolvedValueOnce(payload([raw(1)], 2)).mockResolvedValueOnce(payload([raw(1)], 2));
    await expect(provider.list(date, date)).rejects.toThrow('重复');
  });
  it('数据返回了错误日期时拒绝使用，不污染缓存', async () => {
    vi.spyOn(http, 'eastMoneyFetchJson').mockResolvedValue({
      success: true,
      code: 0,
      message: 'ok',
      result: {
        count: 1,
        pages: 1,
        data: [raw(1, { TRADE_DATE: '2024-01-04 00:00:00' })],
      },
    });
    await expect(new EastMoneyLonghubangProvider().list(date, date)).rejects.toThrow('未正确应用');
  });
});

describe('完整业务字段与周期统计', () => {
  it('自然周跨年、闰月、季度边界和逐日导航准确', () => {
    expect(lhbCalendarRange('2025-01-01', 'week')).toEqual({ startDate: '2024-12-30', endDate: '2025-01-05' });
    expect(lhbCalendarRange('2024-02-10', 'month')).toEqual({ startDate: '2024-02-01', endDate: '2024-02-29' });
    expect(lhbCalendarRange('2024-08-31', 'quarter')).toEqual({ startDate: '2024-07-01', endDate: '2024-09-30' });
    expect(shiftLhbCalendar('2024-03-01', 'day', -1)).toBe('2024-02-29');
    expect(shiftLhbCalendar('2024-01-31', 'month', 1)).toBe('2024-02-01');
    expect(shiftLhbCalendar('2024-01-01', 'quarter', -1)).toBe('2023-10-01');
    expect(lhbQuerySchema.safeParse({ startDate: '2024-07-01', endDate: '2024-09-30' }).success).toBe(true);
    expect(lhbQuerySchema.safeParse({ startDate: '2024-07-01', endDate: '2024-10-01' }).success).toBe(false);
    expect(lhbQuerySchema.safeParse({ ...request, minAppearances: 3, maxAppearances: 2 }).success).toBe(false);
    expect(lhbQuerySchema.safeParse({ ...request, minInstitutionBuyCount: 1.5 }).success).toBe(false);
  });
  it('新增行情、成交、历史表现字段使用上游尺度，缺失历史保持 null', () => {
    const row = mapLhbEvent(
      raw(9, {
        CLOSE_PRICE: 12.34,
        BILLBOARD_DEAL_AMT: 50.01,
        ACCUM_AMOUNT: 1000,
        DEAL_AMOUNT_RATIO: 5.001,
        D20_CLOSE_ADJCHRATE: -3.12,
        TRADE_MARKET: '上交所科创板',
        SECURITY_TYPE_CODE: '060',
      }),
    );
    expect(row.dealCents).toBe(5001);
    expect(row.marketDealCents).toBe(100000);
    expect(row.dealRatioPercent).toBe(5.001);
    expect(row.after20Percent).toBe(-3.12);
    expect(row.after30Percent).toBeNull();
    expect(row.securityType).toBe('bond');
    expect(row.board).toBe('上交所科创板');
  });
  it('所有数值条件的上下限在完整范围生效，缺失值不会当零', async () => {
    for (const field of LHB_NUMERIC_FILTERS.filter((row) => row.group !== '机构')) {
      const [min, max] = lhbRangeKeys(field.field);
      const { service } = setup([
        event(1, { [field.field]: 10 }),
        event(2, { [field.field]: 20 }),
        event(3, { [field.field]: null }),
      ]);
      const result = await service.query({ ...request, [min]: 10, [max]: 15 });
      expect(
        result.items.map((row) => row.id),
        field.field,
      ).toEqual(['1']);
    }
  });
  it('机构按日期标的原因匹配，不能把多日机构统计挂到同股单日榜', async () => {
    const { service, provider } = setup([event(1, { reason: '单日原因' }), event(2, { reason: '多日原因' })]);
    vi.mocked(provider.institutions).mockResolvedValue([
      {
        symbol: '000892',
        exchange: 'SZ',
        date,
        reason: '多日原因',
        institutionBuyCount: 2,
        institutionSellCount: 1,
        institutionBuyCents: 6000,
        institutionSellCents: 1000,
        institutionNetCents: 5000,
        institutionNetRatioPercent: 2,
      },
    ]);
    const filtered = await service.query({ ...request, minInstitutionBuyCount: 2, minInstitutionNetCents: 4000 });
    expect(filtered.items.map((row) => row.id)).toEqual(['2']);
    expect(filtered.items[0]?.institutionNetCents).toBe(5000);
    const without = await service.query({ ...request, hasInstitution: false });
    expect(without.items.map((row) => row.id)).toEqual(['1']);
    vi.mocked(provider.institutions).mockRejectedValue(new Error('机构接口失败'));
    const stale = await service.query({ ...request, hasInstitution: true, refresh: true });
    expect(stale.stale).toBe(true);
    expect(stale.items.map((row) => row.id)).toEqual(['2']);
    await expect(service.query({ startDate: '2024-01-04', endDate: date, hasInstitution: true })).rejects.toThrow('机构接口失败');
  });
  it('次数先按完整范围去重再筛选分页，可切换按上榜原因计数', async () => {
    const { service } = setup([
      event(1, { date: '2024-01-02' }),
      event(2, { date: '2024-01-02' }),
      event(3, { date: '2024-01-03' }),
      event(4, { symbol: '600077', exchange: 'SH', date: '2024-01-02' }),
      event(5, { symbol: '600077', exchange: 'SH', date: '2024-01-03' }),
      event(6, { symbol: '600077', exchange: 'SH', date: '2024-01-04' }),
    ]);
    const query = { startDate: '2024-01-01', endDate: date, view: 'stocks' as const, pageSize: 1, minAppearances: 2 };
    const first = await service.query(query),
      second = await service.query({ ...query, page: 2 });
    expect(first.total).toBe(2);
    expect(first.stocks[0]?.latestEvent.symbol).toBe('600077');
    expect(first.stocks[0]?.appearances).toBe(3);
    expect(second.stocks[0]?.appearances).toBe(2);
    expect(second.stocks[0]?.eventCount).toBe(3);
    expect((await service.query({ ...query, minAppearances: 3 })).total).toBe(1);
    expect((await service.query({ ...query, minAppearances: 3, countMode: 'events' })).total).toBe(2);
    expect((await service.query({ ...query, minAppearances: 3, view: 'events' })).items[0]?.symbol).toBe('600077');
    expect((await service.query({ ...query, view: 'events', sort: 'appearances' })).items[0]?.symbol).toBe('600077');
    expect((await service.query({ ...query, view: 'events', sort: 'appearances', order: 'asc' })).items[0]?.symbol).toBe(
      '000892',
    );
    const postFilter = await service.query({ ...query, reason: '没有此原因' });
    expect(postFilter.total).toBe(0);
  });
  it('板块、原因代码、源解读筛选可组合；股票与可转债缓存不混用', async () => {
    const { service, provider } = setup([
      event(1, { board: '上交所科创板', reasonCode: 'x', interpretation: '机构买入' }),
      event(2, { board: '深交所主板' }),
    ]);
    expect(
      (await service.query({ ...request, board: '上交所科创板', reasonCode: 'x', interpretation: '机构' })).items.map(
        (row) => row.id,
      ),
    ).toEqual(['1']);
    await service.query({ ...request, securityType: 'bond' });
    expect(provider.list).toHaveBeenCalledWith(date, date, undefined, 'stock');
    expect(provider.list).toHaveBeenCalledWith(date, date, undefined, 'bond');
  });
});

describe('区间龙虎榜单日净流入', () => {
  it('同日相同金额只计一次，包含区间负值，不混入多日榜，也不随事件条件及计次方式改变', async () => {
    const positive = { date: '2024-01-02', buyCents: 10001, sellCents: 0, netCents: 10001 };
    const { service } = setup([
      event(1, positive),
      event(2, { ...positive, reason: '另一单日原因' }),
      event(3, { date: '2024-01-03', buyCents: 0, sellCents: 5000, netCents: -5000 }),
      event(4, { date: '2024-01-03', period: 'multi', netCents: 90000 }),
      event(5, { date: '2024-01-04', period: 'other', netCents: 50000 }),
    ]);
    const query = { startDate: '2024-01-01', endDate: date, view: 'stocks' as const };
    const all = (await service.query(query)).stocks[0]!;
    expect(all.intervalNetCents).toBe(5001);
    expect(all.intervalNetDays).toBe(2);
    expect(all.intervalNetExcludedRecords).toBe(2);
    const filtered = (await service.query({ ...query, minNetCents: 1, countMode: 'events' })).stocks[0]!;
    expect(filtered.intervalNetCents).toBe(5001);
    expect(filtered.appearances).toBe(4);
  });
  it('金额冲突、缺失或仅有多日榜时为空，真实零保留；排序在分页前生效且空值始终末尾', async () => {
    const { service } = setup([
      event(1, { symbol: '000001', netCents: null }),
      event(2, { symbol: '000002', netCents: 0 }),
      event(3, { symbol: '000003', netCents: 100 }),
      event(4, { symbol: '000003', netCents: 100, buyCents: 999 }),
      event(5, { symbol: '000004', period: 'multi', netCents: 300 }),
      event(6, { symbol: '000005', netCents: -50 }),
      event(7, { symbol: '000006', netCents: 200 }),
      event(8, { symbol: '000001', date: '2024-01-04', netCents: 100 }),
    ]);
    const query = { startDate: '2024-01-01', endDate: date, view: 'stocks' as const, sort: 'intervalNet' as const, pageSize: 2 };
    const first = await service.query(query),
      second = await service.query({ ...query, page: 2 });
    expect(first.stocks.map((row) => row.latestEvent.symbol)).toEqual(['000006', '000002']);
    expect(first.stocks[1]?.intervalNetCents).toBe(0);
    expect(second.stocks[0]?.intervalNetCents).toBe(-50);
    expect(second.stocks[1]?.intervalNetCents).toBeNull();
    expect(second.stocks[1]?.intervalNetUnresolvedDays).toBe(1);
    const last = await service.query({ ...query, page: 3 });
    expect(last.stocks.map((row) => row.intervalNetCents)).toEqual([null, null]);
    const ascending = await service.query({ ...query, order: 'asc' });
    expect(ascending.stocks.map((row) => row.intervalNetCents)).toEqual([-50, 0]);
    expect((await service.query({ ...query, view: 'events' })).items[0]?.symbol).toBe('000006');
  });
  it('整数分累计不损失精度，超出安全整数范围时拒绝显示', async () => {
    const { service } = setup([
      event(1, { date: '2024-01-02', netCents: Number.MAX_SAFE_INTEGER }),
      event(2, { date: '2024-01-03', netCents: 5 }),
      event(3, { date: '2024-01-04', netCents: -Number.MAX_SAFE_INTEGER }),
    ]);
    expect((await service.query({ startDate: '2024-01-01', endDate: date })).stocks[0]?.intervalNetCents).toBe(5);
    const overflow = setup([event(1, { netCents: Number.MAX_SAFE_INTEGER }), event(2, { date: '2024-01-04', netCents: 1 })]);
    await expect(overflow.service.query({ startDate: '2024-01-01', endDate: date })).rejects.toThrow('安全计算范围');
  });
});
