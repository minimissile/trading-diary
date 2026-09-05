import type { ResearchInput, ResearchRow } from '../../shared/quant-research/workbench';
import type { ReportBody } from './research-simulations';

type Obj = Record<string, unknown>;
type Fetch = (url: string | URL, init?: RequestInit) => Promise<Response>;
export interface ShareObservation {
  symbol: string;
  date: string;
  shares: number;
}
export interface ResearchDataProvider {
  lof(input: ResearchInput<'lof'>): Promise<ReportBody>;
  shares(
    input: ResearchInput<'shares'>,
    previous: (symbol: string, date: string) => ShareObservation | null,
  ): Promise<ReportBody & { observations: ShareObservation[] }>;
  announcements(input: ResearchInput<'announcements'>): Promise<ReportBody>;
  market(input: ResearchInput<'market'>): Promise<ReportBody>;
  fundamentals(input: ResearchInput<'fundamentals'>): Promise<ReportBody>;
  bonds(input: ResearchInput<'bonds'>): Promise<ReportBody>;
}
const obj = (v: unknown): Obj => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : {});
const list = (v: unknown): Obj[] => (Array.isArray(v) ? v.map(obj) : []);
const str = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
export const researchNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const dateOnly = (v: unknown) => str(v).slice(0, 10);
const source = '东方财富公开数据';
const basics = (title: string, asOf: string): ReportBody => ({
  title,
  asOf,
  source,
  notes: [],
  warnings: [],
  metrics: [],
  columns: [],
  rows: [],
});
const codeColumns = [
  { key: 'symbol', label: '代码' },
  { key: 'name', label: '名称' },
];
async function parallelMap<T, R>(values: T[], concurrency: number, task: (v: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      for (;;) {
        const i = cursor++;
        if (i >= values.length) return;
        results[i] = await task(values[i]!);
      }
    }),
  );
  return results;
}

export class PublicResearchDataProvider implements ResearchDataProvider {
  constructor(
    private readonly request: Fetch = fetch,
    private readonly now = () => new Date(),
    private readonly signal?: AbortSignal,
  ) {}
  private today(): string {
    return new Date(this.now().getTime() + 8 * 36e5).toISOString().slice(0, 10);
  }
  private async json(
    base: string,
    params: Record<string, string | number>,
    referer = 'https://quote.eastmoney.com/',
  ): Promise<Obj> {
    const url = new URL(base);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    const timeout = AbortSignal.timeout(12000);
    const signal = this.signal ? AbortSignal.any([this.signal, timeout]) : timeout;
    signal.throwIfAborted();
    const response = await this.request(url, {
      signal,
      headers: { Referer: referer, 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`公开数据接口 HTTP ${response.status}`);
    return obj(await response.json());
  }
  private async quotes(fundType: 'etf' | 'lof'): Promise<Obj[]> {
    const rows: Obj[] = [];
    for (let page = 1; page <= 30; page++) {
      const payload = await this.json('https://push2delay.eastmoney.com/api/qt/clist/get', {
        pn: page,
        pz: 100,
        po: 0,
        np: 1,
        fltt: 2,
        invt: 2,
        fid: 'f12',
        fs: fundType === 'lof' ? 'b:MK0404,b:MK0405,b:MK0406,b:MK0407' : 'b:MK0021,b:MK0022,b:MK0023,b:MK0024,b:MK0827',
        fields: 'f2,f3,f6,f12,f13,f14,f38,f124,f297',
      });
      const data = obj(payload.data),
        total = researchNumber(data.total);
      if (payload.rc !== 0 || total === null || !Array.isArray(data.diff)) throw new Error('基金行情返回异常或暂不可用');
      const batch = list(data.diff);
      rows.push(...batch);
      if (rows.length >= total) return rows;
      if (!batch.length) throw new Error('基金行情分页不完整，请稍后重试');
    }
    throw new Error('基金行情超过本模块 3000 条上限，请稍后重试');
  }
  private async report(params: Record<string, string | number>, all = true): Promise<Obj[]> {
    const rows: Obj[] = [];
    for (let page = 1; page <= 20; page++) {
      const payload = await this.json('https://datacenter-web.eastmoney.com/api/data/v1/get', {
        ...params,
        pageSize: 500,
        pageNumber: page,
        source: 'WEB',
        client: 'WEB',
      });
      const result = obj(payload.result);
      if (payload.success !== true || !Array.isArray(result.data))
        throw new Error(str(payload.message) || '报表数据不可用，请调整条件或稍后重试');
      rows.push(...list(result.data));
      if (!all || page >= Number(result.pages)) return rows;
    }
    throw new Error('报表超过读取上限，未保存不完整结果');
  }
  private select(quotes: Obj[], symbols: string[]): { selected: Obj[]; missing: string[] } {
    return {
      selected: symbols.length ? quotes.filter((q) => symbols.includes(str(q.f12))) : quotes,
      missing: symbols.filter((s) => !quotes.some((q) => str(q.f12) === s)),
    };
  }
  private quoteDate(q: Obj): string {
    const v = str(q.f297);
    const date = /^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6)}` : '';
    if (!date || !Number.isFinite(Date.parse(date)) || date > this.today()) throw new Error('行情数据日期无效');
    return date;
  }
  async lof(input: ResearchInput<'lof'>): Promise<ReportBody> {
    const { selected, missing } = this.select(await this.quotes('lof'), input.symbols);
    if (!selected.length) throw new Error('所选代码不在当前 LOF 行情列表中');
    const report = basics('LOF 折溢价观察', this.today());
    report.warnings.push(...missing.map((s) => `${s}：不在 LOF 行情列表中`));
    const results = await parallelMap(selected, 6, async (q) => {
      const symbol = str(q.f12);
      try {
        const payload = await this.json(
          'https://api.fund.eastmoney.com/f10/lsjz',
          { fundCode: symbol, pageIndex: 1, pageSize: 1 },
          `https://fundf10.eastmoney.com/jjgz/${symbol}.html`,
        );
        const navRow = list(obj(payload.Data).LSJZList)[0];
        const nav = researchNumber(navRow?.DWJZ),
          price = researchNumber(q.f2);
        const navDate = dateOnly(navRow?.FSRQ),
          quoteDate = this.quoteDate(q);
        if (
          payload.ErrCode !== 0 ||
          !nav ||
          nav <= 0 ||
          !price ||
          price <= 0 ||
          !/^\d{4}-\d{2}-\d{2}$/.test(navDate) ||
          navDate > quoteDate
        )
          throw new Error('价格或已公布净值无效 / 日期不匹配');
        const premium = (price / nav - 1) * 100;
        const lag = Math.round((Date.parse(quoteDate) - Date.parse(navDate)) / 864e5);
        return {
          symbol,
          name: str(q.f14),
          price,
          nav,
          premium,
          quoteDate,
          navDate,
          lag,
          subscribe: str(navRow?.SGZT) || '未知',
          redeem: str(navRow?.SHZT) || '未知',
          threshold: Math.abs(premium) >= input.threshold ? (premium >= 0 ? '溢价超阈值' : '折价超阈值') : '范围内',
          afterFees: Math.abs(premium) - input.feePct,
        } satisfies ResearchRow;
      } catch (e) {
        report.warnings.push(`${symbol} ${str(q.f14)}：${e instanceof Error ? e.message : '读取失败'}`);
        return null;
      }
    });
    report.rows = results
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => Math.abs(b.premium) - Math.abs(a.premium));
    if (!report.rows.length) throw new Error(`LOF 净值读取全部失败：${report.warnings.slice(0, 3).join('；')}`);
    report.asOf = [...new Set(report.rows.map((r) => str(r.quoteDate)))].sort().join(' / ');
    report.metrics = [
      { label: '有效 LOF', value: String(report.rows.length) },
      { label: '偏离阈值', value: String(report.rows.filter((r) => Math.abs(Number(r.premium)) >= input.threshold).length) },
      { label: '净值日期滞后', value: String(report.rows.filter((r) => Number(r.lag) > 0).length) },
      { label: '未完成', value: String(report.warnings.length) },
    ];
    report.columns = [
      ...codeColumns,
      { key: 'price', label: '场内价', format: 'number' },
      { key: 'nav', label: '公布净值', format: 'number' },
      { key: 'premium', label: '折溢价', format: 'percent' },
      { key: 'threshold', label: '阈值状态' },
      { key: 'quoteDate', label: '行情日期' },
      { key: 'navDate', label: '净值日期' },
      { key: 'subscribe', label: '申购' },
      { key: 'redeem', label: '赎回' },
      { key: 'afterFees', label: '绝对偏离减费用', format: 'percent' },
    ];
    report.notes = [
      '折溢价 =（场内价格 ÷ 最近公布单位净值 − 1）× 100%，正数为溢价。净值并非实时估值，特别是 QDII 跨时区基金。',
      `费用参考值 ${input.feePct}% 仅从绝对偏离中扣除，不代表可执行套利收益；申赎状态取自净值记录，实际限额、到账时间及最新公告需另核对。`,
      '自动监控仅在本页打开且应用处于运行状态时按所设间隔刷新；每次成功刷新独立保存记录，不创建现有 LOF 模块的提醒或任务。',
    ];
    return report;
  }
  async shares(
    input: ResearchInput<'shares'>,
    previous: (symbol: string, date: string) => ShareObservation | null,
  ): Promise<ReportBody & { observations: ShareObservation[] }> {
    const { selected, missing } = this.select(await this.quotes(input.fundType), input.symbols);
    const report = basics(`${input.fundType.toUpperCase()} 场内份额观察`, this.today());
    const observations: ShareObservation[] = [];
    report.warnings.push(...missing.map((s) => `${s}：未找到该类基金`));
    for (const q of selected) {
      const symbol = str(q.f12),
        shares = researchNumber(q.f38);
      try {
        const date = this.quoteDate(q);
        if (shares === null || shares <= 0) throw new Error('缺少有效场内份额');
        const prev = previous(symbol, date);
        const change = prev ? (shares / prev.shares - 1) * 100 : null;
        observations.push({ symbol, date, shares });
        report.rows.push({
          symbol,
          name: str(q.f14),
          date,
          shares,
          previousDate: prev?.date ?? '首次建立基线',
          previousShares: prev?.shares ?? null,
          delta: prev ? shares - prev.shares : null,
          change,
          status: change === null ? '建立基线' : Math.abs(change) >= input.threshold ? '份额异动' : '范围内',
        });
      } catch (e) {
        report.warnings.push(`${symbol}：${e instanceof Error ? e.message : '数据异常'}`);
      }
    }
    if (!observations.length) throw new Error('未取得可用的基金场内份额');
    report.rows.sort((a, b) => Math.abs(Number(b.change)) - Math.abs(Number(a.change)));
    report.asOf = [...new Set(observations.map((o) => o.date))].sort().join(' / ');
    report.metrics = [
      { label: '基金数量', value: String(report.rows.length) },
      { label: '份额异动', value: String(report.rows.filter((r) => r.status === '份额异动').length) },
      { label: '建立基线', value: String(report.rows.filter((r) => r.change === null).length) },
    ];
    report.columns = [
      ...codeColumns,
      { key: 'date', label: '数据日期' },
      { key: 'shares', label: '场内份额', format: 'number' },
      { key: 'previousDate', label: '比较基准日' },
      { key: 'delta', label: '份额增减', format: 'number' },
      { key: 'change', label: '变动比例', format: 'percent' },
      { key: 'status', label: '状态' },
    ];
    report.notes = [
      '份额来自行情 f38 字段，反映场内份额口径，不是所有份额类别合计的基金总规模，也不等于净资金流。',
      '与本模块保存的上一个更早数据日期比较。同一天多次刷新覆盖当日快照，不与同日快照比较；未连续采样时变化跨度会超过一天。',
      '各证券保留最近 90 个数据日期的基线。原始数据源可能延迟更新，不能将变化直接解释成当日申赎。',
    ];
    return { ...report, observations };
  }
  async announcements(input: ResearchInput<'announcements'>): Promise<ReportBody> {
    const report = basics('上市公司公告事件', `${input.startDate} — ${input.endDate}`);
    let count = 0;
    for (let page = 1; page <= 5; page++) {
      const payload = await this.json('https://np-anotice-stock.eastmoney.com/api/security/ann', {
        sr: -1,
        page_size: 100,
        page_index: page,
        ann_type: 'A',
        client_source: 'web',
        f_node: 0,
        s_node: 0,
        begin_time: input.startDate,
        end_time: input.endDate,
        ...(input.symbols.length ? { stock_list: input.symbols.join(',') } : {}),
      });
      const data = obj(payload.data);
      if (payload.success !== 1 || !Array.isArray(data.list)) throw new Error('公告接口暂不可用');
      count = Number(data.total_hits);
      for (const item of list(data.list)) {
        const codes = list(item.codes);
        const security = codes.find((c) => str(c.ann_type).startsWith('A')) ?? codes[0];
        const title = str(item.title),
          symbol = str(security?.stock_code),
          article = str(item.art_code);
        if (input.keyword && !title.includes(input.keyword)) continue;
        const events = ['减持', '增持', '回购', '质押', '业绩', '分红', '风险', '诉讼', '停牌', '重组', '退市', '处罚'].filter(
          (word) => title.includes(word),
        );
        report.rows.push({
          symbol,
          name: str(security?.short_name),
          date: dateOnly(item.notice_date),
          title,
          category: list(item.columns)
            .map((c) => str(c.column_name))
            .join(' / '),
          events: events.join(' / ') || '其他',
          url:
            /^\d{6}$/.test(symbol) && /^AN\d+$/.test(article)
              ? `https://data.eastmoney.com/notices/detail/${symbol}/${article}.html`
              : null,
        });
      }
      if (page * 100 >= count) break;
    }
    if (count > 500)
      report.warnings.push(
        `符合日期和代码范围的公告有 ${count} 条，本次读取最新 500 条；缩小日期或代码范围可继续查阅。关键词仅在已读取范围内筛选。`,
      );
    report.metrics = [
      { label: '范围内公告总数', value: String(count) },
      { label: '本次匹配', value: String(report.rows.length) },
    ];
    report.columns = [
      ...codeColumns,
      { key: 'date', label: '公告日期' },
      { key: 'title', label: '公告标题' },
      { key: 'category', label: '公告类型' },
      { key: 'events', label: '事件标签' },
      { key: 'url', label: '原文', format: 'link' },
    ];
    report.notes = ['仅检索 A 股公司公告，按公告日期倒序读取。事件标签由标题关键词匹配，详情以原文为准。'];
    return report;
  }
  async market(input: ResearchInput<'market'>): Promise<ReportBody> {
    const report = basics('涨跌停市场情绪', input.date);
    const pools = await Promise.all(
      [
        ['getTopicZTPool', '涨停'],
        ['getTopicDTPool', '跌停'],
        ['getTopicZBPool', '炸板'],
      ].map(async ([endpoint, label]) => {
        const payload = await this.json(`https://push2ex.eastmoney.com/${endpoint}`, {
          ut: '7eea3edcaed734bea9cbfc24409ed989',
          dpt: 'wz.ztzt',
          Pageindex: 0,
          pagesize: 10000,
          sort: endpoint === 'getTopicDTPool' ? 'fund:asc' : 'fbt:asc',
          date: input.date.replaceAll('-', ''),
        });
        const data = obj(payload.data);
        if (payload.rc !== 0 || !Array.isArray(data.pool) || String(data.qdate) !== input.date.replaceAll('-', ''))
          throw new Error(`${label}池没有 ${input.date} 的有效数据，接口仅保留近期交易日`);
        const rows = list(data.pool);
        if (researchNumber(data.tc) !== rows.length) throw new Error(`${label}池返回不完整，未保存统计`);
        return { label: label!, rows };
      }),
    );
    for (const pool of pools)
      for (const item of pool.rows)
        report.rows.push({
          symbol: str(item.c),
          name: str(item.n),
          pool: pool.label,
          price: researchNumber(item.p) === null ? null : Number(item.p) / 1000,
          change: researchNumber(item.zdp),
          industry: str(item.hybk),
          boards: researchNumber(item.lbc ?? item.days),
          breaks: researchNumber(item.zbc ?? item.oc),
          amount: researchNumber(item.amount),
          sealed: researchNumber(item.fund),
        });
    const zt = pools[0]!.rows.length,
      zb = pools[2]!.rows.length;
    report.metrics = [
      ...pools.map((p) => ({ label: `${p.label}家数`, value: String(p.rows.length) })),
      { label: '炸板率', value: zt + zb ? `${((zb / (zt + zb)) * 100).toFixed(2)}%` : '—' },
      { label: '最高连板', value: String(Math.max(0, ...pools[0]!.rows.map((r) => Number(r.lbc) || 0))) },
    ];
    report.columns = [
      ...codeColumns,
      { key: 'pool', label: '状态' },
      { key: 'price', label: '价格', format: 'number' },
      { key: 'change', label: '涨跌幅', format: 'percent' },
      { key: 'industry', label: '行业' },
      { key: 'boards', label: '连板数', format: 'number' },
      { key: 'breaks', label: '炸板次数', format: 'number' },
      { key: 'amount', label: '成交额', format: 'money' },
      { key: 'sealed', label: '封板资金', format: 'money' },
    ];
    const industries = new Map<string, number>();
    pools[0]!.rows.forEach((r) => {
      const industry = str(r.hybk) || '未知';
      industries.set(industry, (industries.get(industry) ?? 0) + 1);
    });
    report.notes = [
      '采用东方财富涨停专题口径：不包含 ST、科创板，涨停池还排除未开板连续一字新股；家数不是全市场完整统计。',
      '炸板率 = 炸板家数 ÷（涨停家数 + 炸板家数）。盘中数据随行情变化。',
      `涨停行业分布：${
        [...industries]
          .sort((a, b) => b[1] - a[1])
          .map(([name, count]) => `${name} ${count}`)
          .join('、') || '无'
      }`,
    ];
    return report;
  }
  async fundamentals(input: ResearchInput<'fundamentals'>): Promise<ReportBody> {
    const data = await this.report({
      reportName: 'RPT_LICO_FN_CPD',
      columns:
        'SECURITY_CODE,SECURITY_NAME_ABBR,REPORTDATE,NOTICE_DATE,BASIC_EPS,TOTAL_OPERATE_INCOME,PARENT_NETPROFIT,WEIGHTAVG_ROE,YSTZ,SJLTZ,BPS,MGJYXJJE,PUBLISHNAME',
      filter: `(REPORTDATE='${input.reportDate}')${input.symbols.length ? `(SECURITY_CODE in (${input.symbols.map((s) => `"${s}"`).join(',')}))` : ''}`,
      sortColumns: 'SECURITY_CODE',
      sortTypes: 1,
    });
    const report = basics('财务筛选与风险标记', input.reportDate);
    let missing = 0;
    for (const item of data) {
      const symbol = str(item.SECURITY_CODE);
      if (!/^(?:00[0-3]|30[01]|60[0135]|688)\d{3}$/.test(symbol)) continue;
      const profit = researchNumber(item.PARENT_NETPROFIT),
        roe = researchNumber(item.WEIGHTAVG_ROE),
        growth = researchNumber(item.SJLTZ),
        cash = researchNumber(item.MGJYXJJE),
        bps = researchNumber(item.BPS);
      if (roe === null || growth === null || profit === null) {
        missing++;
        continue;
      }
      if (roe < input.minRoe || growth < input.minGrowth || (input.excludeLoss && profit <= 0)) continue;
      const flags = [
        profit <= 0 ? '净利润非正' : '',
        cash !== null && cash < 0 ? '经营现金流为负' : '',
        bps !== null && bps <= 0 ? '净资产非正' : '',
        /ST|退/.test(str(item.SECURITY_NAME_ABBR)) ? 'ST / 退市标记' : '',
      ].filter(Boolean);
      report.rows.push({
        symbol,
        name: str(item.SECURITY_NAME_ABBR),
        reportDate: dateOnly(item.REPORTDATE),
        noticeDate: dateOnly(item.NOTICE_DATE),
        roe,
        growth,
        revenueGrowth: researchNumber(item.YSTZ),
        revenue: researchNumber(item.TOTAL_OPERATE_INCOME),
        profit,
        eps: researchNumber(item.BASIC_EPS),
        cash,
        industry: str(item.PUBLISHNAME),
        risk: flags.join(' / ') || '未命中本页规则',
      });
    }
    report.rows.sort((a, b) => Number(b.roe) - Number(a.roe));
    report.metrics = [
      { label: '已披露记录', value: String(data.length) },
      { label: '筛选命中', value: String(report.rows.length) },
      { label: '关键字段缺失', value: String(missing) },
    ];
    report.columns = [
      ...codeColumns,
      { key: 'roe', label: '加权 ROE', format: 'percent' },
      { key: 'growth', label: '净利润同比', format: 'percent' },
      { key: 'revenueGrowth', label: '营收同比', format: 'percent' },
      { key: 'profit', label: '归母净利润', format: 'money' },
      { key: 'cash', label: '每股经营现金流', format: 'number' },
      { key: 'industry', label: '行业' },
      { key: 'noticeDate', label: '披露日期' },
      { key: 'risk', label: '风险标记' },
    ];
    if (missing) report.warnings.push(`${missing} 条记录因 ROE / 利润 / 同比缺失被排除。`);
    report.notes = [
      '使用指定报告期的累计财务数据，ROE 未年化；只覆盖数据源已披露且属于沪深 A 股的记录。',
      '这是最新可取得的该报告期数据，可能包含事后更正，不可作为历史时点已知数据回填到回测。风险标记仅覆盖本页规则。',
    ];
    return report;
  }
  async bonds(input: ResearchInput<'bonds'>): Promise<ReportBody> {
    const data = await this.report({
      reportName: 'RPT_BOND_CB_LIST',
      columns:
        'SECURITY_CODE,SECURITY_NAME_ABBR,CONVERT_STOCK_CODE,SECURITY_SHORT_NAME,RATING,LISTING_DATE,DELIST_DATE,EXPIRE_DATE,NOTICE_DATE_SH,EXECUTE_START_DATESH,EXECUTE_REASON_SH',
      quoteColumns:
        'f2~01~CONVERT_STOCK_CODE~CONVERT_STOCK_PRICE,f235~10~SECURITY_CODE~TRANSFER_PRICE,f236~10~SECURITY_CODE~TRANSFER_VALUE,f2~10~SECURITY_CODE~CURRENT_BOND_PRICE,f237~10~SECURITY_CODE~TRANSFER_PREMIUM_RATIO',
      sortColumns: 'PUBLIC_START_DATE',
      sortTypes: -1,
    });
    const report = basics('可转债双低与转股溢价', this.today());
    let eligible = 0;
    for (const item of data) {
      const price = researchNumber(item.CURRENT_BOND_PRICE),
        value = researchNumber(item.TRANSFER_VALUE);
      if (
        dateOnly(item.EXPIRE_DATE) <= this.today() ||
        !price ||
        price <= 0 ||
        !value ||
        value <= 0 ||
        !item.LISTING_DATE ||
        dateOnly(item.LISTING_DATE) > this.today() ||
        (item.DELIST_DATE && dateOnly(item.DELIST_DATE) <= this.today())
      )
        continue;
      eligible++;
      const premium = (price / value - 1) * 100;
      if (price > input.maxPrice || premium > input.maxPremium) continue;
      report.rows.push({
        symbol: str(item.SECURITY_CODE),
        name: str(item.SECURITY_NAME_ABBR),
        price,
        value,
        premium,
        doubleLow: price + premium,
        stock: `${str(item.CONVERT_STOCK_CODE)} ${str(item.SECURITY_SHORT_NAME)}`,
        rating: str(item.RATING),
        expiry: dateOnly(item.EXPIRE_DATE),
        redeem: item.NOTICE_DATE_SH ? `赎回公告 ${dateOnly(item.NOTICE_DATE_SH)}` : '未返回赎回公告信息',
        redeemDate: dateOnly(item.EXECUTE_START_DATESH) || '—',
      });
    }
    report.rows.sort((a, b) => Number(a.doubleLow) - Number(b.doubleLow));
    report.metrics = [
      { label: '可用上市转债', value: String(eligible) },
      { label: '筛选命中', value: String(report.rows.length) },
    ];
    report.columns = [
      ...codeColumns,
      { key: 'price', label: '转债价', format: 'number' },
      { key: 'value', label: '转股价值', format: 'number' },
      { key: 'premium', label: '转股溢价', format: 'percent' },
      { key: 'doubleLow', label: '双低值', format: 'number' },
      { key: 'stock', label: '正股' },
      { key: 'rating', label: '评级' },
      { key: 'expiry', label: '到期日' },
      { key: 'redeem', label: '赎回信息' },
      { key: 'redeemDate', label: '赎回起始日' },
    ];
    report.notes = [
      '转股溢价 =（转债价 ÷ 转股价值 − 1）× 100%；双低值 = 价格 + 溢价百分数。仅保留已上市且有可用报价的记录。',
      '报表不提供各报价的交易时间，数据日期标为抓取日，可能是上一交易日价格。赎回信息未返回不等于不存在赎回风险，须核对发行人公告。',
    ];
    return report;
  }
}
