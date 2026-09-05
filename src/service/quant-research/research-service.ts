import { randomUUID } from 'node:crypto';
import {
  researchKindSchema,
  researchRequestSchema,
  type ResearchKind,
  type ResearchReport,
  type ResearchRequest,
  type ResearchState,
} from '../../shared/quant-research/workbench';
import { quantCompletedDate } from '../../shared/quant-research/catalog';
import { TencentQuantDataProvider, type QuantDataProvider } from './quant-data';
import { PublicResearchDataProvider, type ResearchDataProvider, type ShareObservation } from './research-market-data';
import type { ResearchWorkbenchDatabase } from './research-database';
import { simulateBacktest, simulatePrediction, type ReportBody } from './research-simulations';

export class ResearchWorkbenchService {
  private readonly pending = new Map<ResearchKind, { key: string; promise: Promise<ResearchReport> }>();
  constructor(
    private readonly database: ResearchWorkbenchDatabase,
    private readonly data?: ResearchDataProvider,
    private readonly bars: QuantDataProvider = new TencentQuantDataProvider(),
    private readonly now = () => new Date(),
  ) {}
  state(kind: ResearchKind): ResearchState {
    return this.database.state(researchKindSchema.parse(kind));
  }
  get(id: string): ResearchReport {
    return this.database.get(id);
  }
  save(input: ResearchRequest): ResearchRequest {
    return this.database.saveSettings(researchRequestSchema.parse(input));
  }
  run(input: ResearchRequest): Promise<ResearchReport> {
    const parsed = researchRequestSchema.parse(input);
    const key = JSON.stringify(parsed),
      current = this.pending.get(parsed.kind);
    if (current) {
      if (current.key === key) return current.promise;
      throw new Error('此研究工具正在运行，请等待完成后修改条件');
    }
    const promise = this.execute(parsed).finally(() => this.pending.delete(parsed.kind));
    this.pending.set(parsed.kind, { key, promise });
    return promise;
  }
  private async execute(input: ResearchRequest): Promise<ResearchReport> {
    let body: ReportBody;
    let observations: ShareObservation[] = [];
    const data = this.data ?? new PublicResearchDataProvider(fetch, this.now, AbortSignal.timeout(300_000));
    const today = new Date(this.now().getTime() + 8 * 36e5).toISOString().slice(0, 10);
    if (
      ('endDate' in input && input.endDate > today) ||
      (input.kind === 'market' && input.date > today) ||
      (input.kind === 'fundamentals' && input.reportDate > today)
    )
      throw new Error('不能查询未来日期');
    switch (input.kind) {
      case 'prices': {
        const cutoff = quantCompletedDate(this.now());
        const series = await this.bars.load(input.symbol, input.endDate < cutoff ? input.endDate : cutoff);
        const bars = series.bars.slice(-input.days);
        body = {
          title: `${series.name} · 日线采集`,
          asOf: bars.at(-1)!.date,
          source: '腾讯前复权日线',
          metrics: [
            { label: '日线数量', value: String(bars.length) },
            { label: '起始日期', value: bars[0]!.date },
            { label: '结束日期', value: bars.at(-1)!.date },
          ],
          columns: [
            { key: 'date', label: '交易日' },
            { key: 'open', label: '开盘', format: 'number' },
            { key: 'high', label: '最高', format: 'number' },
            { key: 'low', label: '最低', format: 'number' },
            { key: 'close', label: '收盘', format: 'number' },
            { key: 'volume', label: '成交量（手）', format: 'number' },
          ],
          rows: bars.map((bar) => ({ ...bar })),
          warnings: bars.length < input.days ? [`可用日线 ${bars.length} 根，少于请求的 ${input.days} 根。`] : [],
          notes: ['使用前复权价格，成交量采用腾讯原始接口口径（手）。最多读取 600 根完整日线，不覆盖现有行情缓存。'],
        };
        break;
      }
      case 'backtest':
      case 'prediction': {
        const cutoff = quantCompletedDate(this.now());
        const effective = { ...input, endDate: input.endDate < cutoff ? input.endDate : cutoff };
        const series = await this.bars.load(input.symbol, effective.endDate);
        body = effective.kind === 'backtest' ? simulateBacktest(effective, series) : simulatePrediction(effective, series);
        break;
      }
      case 'lof':
        body = await data.lof(input);
        break;
      case 'shares': {
        const result = await data.shares(input, (symbol, date) => this.database.previous(symbol, date));
        observations = result.observations;
        body = result;
        break;
      }
      case 'announcements':
        body = await data.announcements(input);
        break;
      case 'market': {
        const calendar = await this.bars.load('000300', input.date, true);
        const date = calendar.bars.at(-1)?.date;
        if (!date || Date.parse(input.date) - Date.parse(date) > 15 * 864e5) throw new Error('无法确认最近交易日');
        body = await data.market({ ...input, date });
        if (date !== input.date) body.notes.push(`所选日期 ${input.date} 没有指数日线，使用最近交易日 ${date}。`);
        break;
      }
      case 'fundamentals':
        body = await data.fundamentals(input);
        break;
      case 'bonds':
        body = await data.bonds(input);
        break;
    }
    return this.database.save(
      { ...body, id: randomUUID(), kind: input.kind, createdAt: this.now().toISOString(), request: input },
      observations,
    );
  }
}
