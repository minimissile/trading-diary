import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { migrations } from '../src/service/database/migrations';
import { ResearchWorkbenchDatabase } from '../src/service/quant-research/research-database';
import {
  PublicResearchDataProvider,
  researchNumber,
  type ResearchDataProvider,
} from '../src/service/quant-research/research-market-data';
import { ResearchWorkbenchService } from '../src/service/quant-research/research-service';
import { simulateBacktest, simulatePrediction, type ReportBody } from '../src/service/quant-research/research-simulations';
import {
  defaultResearchRequest,
  researchReportSchema,
  researchRequestSchema,
  type ResearchInput,
  type ResearchKind,
  type ResearchReport,
  type ResearchRequest,
} from '../src/shared/quant-research/workbench';
import type { QuantSeries } from '../src/shared/quant-research/types';
import { serviceRequestSchema } from '../src/shared/service.schemas';

const now = () => new Date('2026-09-06T03:00:00Z');
const handles: DatabaseSync[] = [];
const database = () => {
  const db = new DatabaseSync(':memory:');
  handles.push(db);
  db.exec(migrations.find((m) => m.name === 'quant_research_workbench')!.sql);
  return new ResearchWorkbenchDatabase(db);
};
afterEach(() => handles.splice(0).forEach((db) => db.close()));
const request = <K extends ResearchKind>(kind: K, overrides: Partial<ResearchInput<K>> = {}): ResearchInput<K> =>
  ({ ...defaultResearchRequest(kind, now()), ...overrides }) as ResearchInput<K>;
const body = (): ReportBody => ({
  title: '测试研究',
  asOf: '2026-09-04',
  source: 'fixture',
  metrics: [],
  rows: [],
  columns: [],
  notes: [],
  warnings: [],
});
const report = (input: ResearchRequest): ResearchReport => ({
  ...body(),
  id: randomUUID(),
  kind: input.kind,
  createdAt: now().toISOString(),
  request: input,
});
function series(count = 550): QuantSeries {
  const bars: QuantSeries['bars'] = [];
  const first = Date.parse('2026-09-04') - (count - 1) * 864e5;
  for (let i = 0; i < count; i++) {
    const close = 100 + i / 20 + Math.sin(i / 3) * 5;
    bars.push({
      date: new Date(first + i * 864e5).toISOString().slice(0, 10),
      open: close - 0.3,
      close,
      high: close + 2,
      low: close - 2,
      volume: 1000 + i,
    });
  }
  return { symbol: '600036', name: '测试证券', bars };
}
const response = (data: unknown) =>
  Promise.resolve(new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } }));
const quote = { f12: '161725', f14: '测试 LOF', f2: 1.1, f38: 1200, f297: 20260904 };

describe('研究输入与服务边界', () => {
  it('全部工具注册进入请求校验，拒绝额外参数和非有限费用', () => {
    for (const kind of [
      'prices',
      'backtest',
      'lof',
      'shares',
      'announcements',
      'market',
      'fundamentals',
      'bonds',
      'prediction',
    ] as const) {
      expect(
        serviceRequestSchema.safeParse({ id: randomUUID(), method: 'quantResearch.toolRun', params: request(kind) }).success,
      ).toBe(true);
    }
    expect(researchRequestSchema.safeParse({ ...request('backtest'), commissionBps: Infinity }).success).toBe(false);
    expect(researchRequestSchema.safeParse({ ...request('lof'), executeOrder: true }).success).toBe(false);
    expect(researchRequestSchema.safeParse(request('announcements', { startDate: '2026-01-01' })).success).toBe(false);
    expect(researchRequestSchema.safeParse(request('fundamentals', { reportDate: '2026-07-15' })).success).toBe(false);
  });
  it('同工具去重并拒绝不同参数并发，失败不覆盖已保存结果', async () => {
    const db = database();
    const input = request('lof');
    const old = db.save(report(input));
    let reject!: (error: Error) => void;
    const data = {
      lof: vi.fn(
        () =>
          new Promise<ReportBody>((_resolve, fail) => {
            reject = fail;
          }),
      ),
    } as unknown as ResearchDataProvider;
    const service = new ResearchWorkbenchService(db, data, undefined, now);
    const first = service.run(input);
    expect(service.run(input)).toBe(first);
    expect(() => service.run({ ...input, threshold: 3 })).toThrow('正在运行');
    reject(new Error('接口不可用'));
    await expect(first).rejects.toThrow('接口不可用');
    expect(db.state('lof').latest?.id).toBe(old.id);
  });
  it('运行在完整日线截止时间内，并拒绝未来查询', async () => {
    const bars = { load: vi.fn(() => Promise.resolve(series())) };
    const service = new ResearchWorkbenchService(database(), undefined, bars, () => new Date('2026-09-04T01:00:00Z'));
    await service.run(request('backtest', { endDate: '2026-09-04' }));
    expect(bars.load).toHaveBeenCalledWith('600036', '2026-09-03');
    await expect(service.run(request('backtest', { endDate: '2027-01-01' }))).rejects.toThrow('未来');
  });
});

describe('独立回测与概率实验', () => {
  it('信号次日成交，最低佣金、滑点与卖出费用进入现金及收益', () => {
    const s = series(50);
    s.bars.forEach((b) => Object.assign(b, { open: 10, close: 10, high: 12, low: 8 }));
    s.bars[29]!.close = 11; // first trading day is index 30
    s.bars[30]!.close = 9; // sell on index 31, not today
    const input = request('backtest', {
      days: 20,
      period: 2,
      capital: 1000,
      commissionBps: 10,
      minCommission: 5,
      sellTaxBps: 10,
      slippageBps: 100,
    });
    const r = simulateBacktest(input, s);
    const buy = r.rows[0]!,
      sell = r.rows[1]!;
    expect(buy.signalDate).toBe(s.bars[29]!.date);
    expect(buy.date).toBe(s.bars[30]!.date);
    expect(sell.date).toBe(s.bars[31]!.date);
    expect(buy.price).toBeCloseTo(10.1);
    expect(buy.units).toBeCloseTo(995 / 10.1);
    expect(buy.fee).toBe(5);
    const proceeds = (995 / 10.1) * 9.9;
    expect(sell.fee).toBeCloseTo(5 + proceeds * 0.001);
    expect(sell.profit).toBeCloseTo(proceeds - 5 - proceeds * 0.001 - 1000);
    expect(r.curve![0]!.equity).toBe(1000);
  });
  it('未来价格不改变较早成交，零量和一字 K 线不可成交', () => {
    const input = request('backtest', { days: 60 });
    const original = series();
    const before = simulateBacktest(input, original);
    const changed = structuredClone(original);
    changed.bars.at(-1)!.close *= 2;
    const after = simulateBacktest(input, changed);
    expect(after.rows).toEqual(before.rows);
    const buyDate = String(before.rows.find((r) => r.side === '买入')!.date);
    const halt = structuredClone(original);
    halt.bars.find((b) => b.date === buyDate)!.volume = 0;
    expect(simulateBacktest(input, halt).rows.some((r) => r.date === buyDate)).toBe(false);
  });
  it('保留期末持仓估值，不虚构最后收盘成交，数据不足报错', () => {
    const s = series(100);
    s.bars.forEach((b, i) => {
      b.close = 100 + i;
      b.open = 100 + i;
      b.high = b.close + 1;
      b.low = b.close - 1;
    });
    const r = simulateBacktest(request('backtest', { days: 20 }), s);
    expect(r.rows).toHaveLength(1);
    expect(r.metrics.find((m) => m.label === '期末持仓')!.value).toContain('持有');
    expect(() => simulateBacktest(request('backtest'), series(50))).toThrow('历史日线不足');
  });
  it('贝叶斯只训练当时已知标签，最后预测不计入命中率', () => {
    const input = request('prediction', { trainingDays: 60, testDays: 20 });
    const s = series();
    const first = simulatePrediction(input, s);
    const changed = structuredClone(s);
    changed.bars.at(-1)!.close *= 2;
    const second = simulatePrediction(input, changed);
    expect(first.rows).toHaveLength(21);
    expect(first.rows[0]!.actual).toBe('待观察');
    expect(first.rows[0]!.correct).toBeNull();
    expect(first.rows.slice(1).map((r) => r.probability)).toEqual(second.rows.slice(1).map((r) => r.probability));
    expect(first.rows.every((r) => Number(r.probability) >= 0 && Number(r.probability) <= 100)).toBe(true);
    expect(researchReportSchema.safeParse({ ...report(input), ...first }).success).toBe(true);
  });
});

describe('独立存储与基金快照', () => {
  it('各工具分别保存设置、20 次历史与结果，淘汰不影响其他工具', () => {
    const db = database();
    const first = db.save(report(request('backtest')));
    const lof = db.save(report(request('lof', { threshold: 6 })));
    for (let i = 0; i < 22; i++) db.save(report(request('backtest', { period: i + 2 })));
    expect(db.state('backtest').history).toHaveLength(20);
    expect(() => db.get(first.id)).toThrow('不存在');
    expect(db.get(lof.id).request).toMatchObject({ threshold: 6 });
    expect(db.state('backtest').settings).toMatchObject({ period: 23 });
  });
  it('同日快照覆盖，比较严格早于当天的数据，保留最近 90 天', () => {
    const db = database();
    const r = report(request('shares'));
    db.save(r, [{ symbol: '161725', date: '2026-09-03', shares: 1000 }]);
    db.save({ ...r, id: randomUUID() }, [{ symbol: '161725', date: '2026-09-04', shares: 1200 }]);
    db.save({ ...r, id: randomUUID() }, [{ symbol: '161725', date: '2026-09-04', shares: 1300 }]);
    expect(db.previous('161725', '2026-09-04')).toMatchObject({ shares: 1000 });
    expect(db.previous('161725', '2026-09-05')).toMatchObject({ shares: 1300 });
    const observations = Array.from({ length: 100 }, (_, i) => ({
      symbol: '510300',
      date: new Date(Date.parse('2026-01-01') + i * 864e5).toISOString().slice(0, 10),
      shares: 1000 + i,
    }));
    db.save({ ...r, id: randomUUID() }, observations);
    expect(db.previous('510300', '2026-01-11')).toBeNull();
  });
  it('份额写入失败会回滚报告与配置', () => {
    const db = database();
    const before = db.save(report(request('shares', { threshold: 2 })));
    expect(() =>
      db.save(report(request('shares', { threshold: 8 })), [{ symbol: '161725', date: '2026-09-04', shares: NaN }]),
    ).toThrow('无效份额');
    expect(db.state('shares').latest?.id).toBe(before.id);
    expect(db.state('shares').settings).toMatchObject({ threshold: 2 });
  });
});

describe('公开数据适配器', () => {
  it('LOF 使用完整沪深列表，按原始价格与净值算百分数并显示日期差', async () => {
    const fetcher = vi.fn((url: string | URL) => {
      const u = new URL(url);
      if (u.pathname.endsWith('/clist/get')) {
        expect(u.searchParams.get('fs')).toBe('b:MK0404,b:MK0405,b:MK0406,b:MK0407');
        return response({ rc: 0, data: { total: 1, diff: [quote] } });
      }
      return response({
        ErrCode: 0,
        Data: { LSJZList: [{ DWJZ: '1', FSRQ: '2026-09-03', SGZT: '暂停申购', SHZT: '开放赎回' }] },
      });
    });
    const r = await new PublicResearchDataProvider(fetcher, now).lof(request('lof'));
    expect(r.rows[0]).toMatchObject({ lag: 1, subscribe: '暂停申购', threshold: '溢价超阈值' });
    expect(r.rows[0]?.premium).toBeCloseTo(10);
  });
  it('缺失数值不转换成零，全部 LOF 净值失败不保存虚假空结果', async () => {
    for (const value of ['', null, undefined, '-', false, Infinity]) expect(researchNumber(value)).toBeNull();
    const fetcher = (url: string | URL) =>
      response(
        new URL(url).pathname.endsWith('/clist/get')
          ? { rc: 0, data: { total: 1, diff: [quote] } }
          : { ErrCode: 0, Data: { LSJZList: [{ DWJZ: '-', FSRQ: '2026-09-04' }] } },
      );
    await expect(new PublicResearchDataProvider(fetcher, now).lof(request('lof'))).rejects.toThrow('全部失败');
  });
  it('跨日期计算份额变化，首次基线不显示伪造的零变化', async () => {
    const p = new PublicResearchDataProvider(() => response({ rc: 0, data: { total: 1, diff: [quote] } }), now);
    expect((await p.shares(request('shares'), () => null)).rows[0]).toMatchObject({ change: null, status: '建立基线' });
    const r = await p.shares(request('shares'), () => ({ symbol: quote.f12, date: '2026-09-01', shares: 1000 }));
    expect(r.rows[0]).toMatchObject({ previousDate: '2026-09-01', delta: 200 });
    expect(r.rows[0]?.change).toBeCloseTo(20);
  });
  it('基金行情分页完整，接口截断时报错', async () => {
    const fetcher = vi.fn((url: string | URL) =>
      response({ rc: 0, data: { total: 2, diff: new URL(url).searchParams.get('pn') === '1' ? [quote] : [] } }),
    );
    await expect(new PublicResearchDataProvider(fetcher, now).shares(request('shares'), () => null)).rejects.toThrow(
      '分页不完整',
    );
  });
  it('跌停池使用正确排序，空池为零但日期不匹配拒绝统计', async () => {
    const fetcher = (url: string | URL) => {
      const u = new URL(url);
      if (u.pathname.endsWith('DTPool')) expect(u.searchParams.get('sort')).toBe('fund:asc');
      return response({ rc: 0, data: { tc: 0, qdate: 20260904, pool: [] } });
    };
    const r = await new PublicResearchDataProvider(fetcher, now).market(request('market', { date: '2026-09-04' }));
    expect(r.rows).toHaveLength(0);
    expect(r.metrics[3]?.value).toBe('—');
    await expect(new PublicResearchDataProvider(fetcher, now).market(request('market', { date: '2026-09-03' }))).rejects.toThrow(
      '有效数据',
    );
  });
  it('公告关键词筛选与原文链接使用安全标识符', async () => {
    const items = ['回购股份公告', '董事会议事规则'].map((title, i) => ({
      title,
      art_code: `AN20260904000${i}`,
      notice_date: '2026-09-04',
      codes: [{ ann_type: 'A', stock_code: '600036', short_name: '招商银行' }],
      columns: [{ column_name: '公司公告' }],
    }));
    const p = new PublicResearchDataProvider(() => response({ success: 1, data: { total_hits: 2, list: items } }), now);
    const r = await p.announcements(request('announcements', { keyword: '回购' }));
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      events: '回购',
      url: 'https://data.eastmoney.com/notices/detail/600036/AN202609040000.html',
    });
  });
  it('财务筛选排除关键数据缺失，负现金流保持风险标记', async () => {
    const item = {
      SECURITY_CODE: '600036',
      SECURITY_NAME_ABBR: '测试',
      PARENT_NETPROFIT: 100,
      WEIGHTAVG_ROE: 10,
      SJLTZ: 20,
      MGJYXJJE: -1,
    };
    const p = new PublicResearchDataProvider(
      () => response({ success: true, result: { pages: 1, data: [item, { ...item, WEIGHTAVG_ROE: null }] } }),
      now,
    );
    const r = await p.fundamentals(request('fundamentals'));
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]?.risk).toBe('经营现金流为负');
    expect(r.warnings).toHaveLength(1);
  });
  it('可转债排除未上市、到期和退市记录并自行计算溢价', async () => {
    const item = {
      SECURITY_CODE: '113001',
      SECURITY_NAME_ABBR: '测试转债',
      CURRENT_BOND_PRICE: 110,
      TRANSFER_VALUE: 100,
      LISTING_DATE: '2026-01-01',
      EXPIRE_DATE: '2030-01-01',
    };
    const p = new PublicResearchDataProvider(
      () =>
        response({
          success: true,
          result: {
            pages: 1,
            data: [
              item,
              { ...item, EXPIRE_DATE: '2026-04-01' },
              { ...item, LISTING_DATE: null },
              { ...item, DELIST_DATE: '2026-02-01' },
            ],
          },
        }),
      now,
    );
    const r = await p.bonds(request('bonds'));
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]?.premium).toBeCloseTo(10);
    expect(r.rows[0]?.doubleLow).toBeCloseTo(120);
  });
});
