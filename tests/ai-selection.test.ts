import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AiSelectionProvider,
  parseSelectionPayload,
  screeningArguments,
  selectScreeningTool,
} from '../src/service/strategy/ai-selection-provider';
import { AiSelectionStore, type SelectionCipher } from '../src/service/strategy/ai-selection-store';
import { aiSelectionQuerySchema, type AiSelectionQuery } from '../src/shared/strategy/ai-selection';
import { stockStrategySettingsSchema } from '../src/shared/schemas/requests/stock-strategy.requests';
import { DEFAULT_STOCK_STRATEGY_SETTINGS } from '../src/shared/strategy/catalog';

const input: AiSelectionQuery = { platform: 'wencai', query: '沪深 A 股，非 ST，按成交额降序', limit: 30 };
const stockRow = { 股票代码: '600036.SH', 股票简称: '招商银行', '涨跌幅[20260904]': 1.25 };
const json = (value: unknown): Response =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const tool = {
  name: 'stock_screen',
  description: '智能选股',
  inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer' } }, required: ['query'] },
};
const mxScreener = {
  name: 'mx_stocks_screener',
  description: '按条件筛选多只证券（选股/选基/选债）。支持A股、港股、美股、基金、债券筛选。',
  inputSchema: { type: 'object', properties: { query: { type: 'string', description: '问句' } }, required: ['query'] },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
};
const directories: string[] = [];
const temp = (): string => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'ai-selection-test-'));
  directories.push(directory);
  return directory;
};
const cipher: SelectionCipher = {
  available: () => true,
  encrypt: (value) => Buffer.from([...value].map((char) => String.fromCharCode(char.charCodeAt(0) ^ 73)).join('')),
  decrypt: (value) => [...value.toString()].map((char) => String.fromCharCode(char.charCodeAt(0) ^ 73)).join(''),
};
afterEach(() => {
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

describe('platform stock selection', () => {
  it('normalizes explicit SH/SZ codes, preserves metric dates, deduplicates and excludes other markets', () => {
    const result = parseSelectionPayload(
      {
        datas: [
          stockRow,
          stockRow,
          { 股票代码: '000333.SZ', 股票简称: '美的集团' },
          { 股票代码: '600036.SZ' },
          { 股票代码: '00700.HK' },
          { 股票代码: 600036 },
        ],
        code_count: 100,
      },
      1,
    );
    expect(result.stocks).toEqual([
      { symbol: '600036', name: '招商银行', metrics: [{ label: '涨跌幅[20260904]', value: '1.25' }] },
    ]);
    expect(result.total).toBe(100);
    expect(result.warnings.join()).toContain('3 条');
    expect(result.warnings.join()).toContain('前 1 只');
  });

  it('parses MCP JSON text and explicit Markdown tables without inventing codes from prose', () => {
    expect(
      parseSelectionPayload({ content: [{ type: 'text', text: JSON.stringify({ datas: [stockRow] }) }] }, 30).stocks[0]?.symbol,
    ).toBe('600036');
    expect(
      parseSelectionPayload(
        { content: [{ type: 'text', text: '| 股票代码 | 股票简称 | PE |\n| --- | --- | --- |\n| 000333.SZ | 美的集团 | 12 |' }] },
        30,
      ).stocks[0]?.symbol,
    ).toBe('000333');
    expect(() => parseSelectionPayload({ content: [{ type: 'text', text: '600036 可能符合条件，请查询确认' }] }, 30)).toThrow(
      '表格',
    );
    expect(parseSelectionPayload({ datas: [], code_count: 0 }, 30).stocks).toEqual([]);
    expect(parseSelectionPayload({ code: 0, data: [stockRow] }, 30).stocks[0]?.symbol).toBe('600036');
    expect(() => parseSelectionPayload({ data: [[600036, '招商银行']] }, 30)).toThrow('表格');
    expect(() =>
      parseSelectionPayload({ content: [{ type: 'text', text: '{"code":401,"data":[],"message":"invalid key"}' }] }, 30),
    ).toThrow('查询失败');
  });

  it('uses the documented Wencai endpoint and bearer key without allowing redirects', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(json({ datas: [stockRow], code_count: 1, status_code: 0 }));
    const result = await new AiSelectionProvider(request).query(input, 'wencai-secret');
    const [url, init] = request.mock.calls[0]!;
    expect(url).toBe('https://openapi.iwencai.com/v1/query2data');
    expect(init?.redirect).toBe('error');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer wencai-secret', 'X-Claw-Skill-Id': 'hithink-astock-selector' });
    expect((init?.headers as Record<string, string>)['X-Claw-Trace-Id']).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.parse(init?.body as string)).toMatchObject({ query: input.query, page: '1', limit: '30', expand_index: 'true' });
    expect(result.stocks[0]?.symbol).toBe('600036');
  });

  it('reports HTTP and business failures, never echoing a key', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(json({ status_code: 1001, status_msg: 'bad key wencai-secret' }));
    const provider = new AiSelectionProvider(request);
    await expect(provider.query(input, 'wencai-secret')).rejects.toThrow('认证失败');
    await expect(provider.query(input, 'wencai-secret')).rejects.toThrow('bad key [已隐藏]');
  });

  it('negotiates MCP, carries session and protocol, discovers the screening tool, and consumes SSE', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const body = await Promise.resolve(JSON.parse(init?.body as string) as { method: string; id: number; params: unknown });
      if (body.method === 'initialize')
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result: { protocolVersion: '2025-03-26', capabilities: {}, serverInfo: { name: 'mx' } },
          }),
          { headers: { 'Content-Type': 'application/json', 'mcp-session-id': 'session-123' } },
        );
      expect(init?.headers).toMatchObject({
        em_api_key: 'eastmoney-secret',
        'Mcp-Session-Id': 'session-123',
        'MCP-Protocol-Version': '2025-03-26',
      });
      expect(init?.headers).not.toHaveProperty('Authorization');
      if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
      if (body.method === 'tools/list')
        return json({ jsonrpc: '2.0', id: body.id, result: { tools: [mxScreener, { name: 'buy_order', description: '买入委托' }] } });
      expect(body.params).toEqual({ name: 'mx_stocks_screener', arguments: { query: input.query } });
      const payload = {
        jsonrpc: '2.0',
        id: body.id,
        result: { content: [{ type: 'text', text: JSON.stringify({ datas: [stockRow], total: 1 }) }] },
      };
      return new Response(`: heartbeat\n\nevent: message\ndata: ${JSON.stringify(payload)}\n\n`, {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    });
    const result = await new AiSelectionProvider(request).query({ ...input, platform: 'eastmoney' }, 'eastmoney-secret');
    expect(result.stocks[0]?.name).toBe('招商银行');
    expect(request).toHaveBeenCalledTimes(4);
    expect(request.mock.calls.every(([url]) => url === 'https://mxapi.eastmoney.com/mxds/mcp')).toBe(true);
  });

  it('refuses ambiguous tools and changed required parameters instead of calling a trading tool', () => {
    expect(() => selectScreeningTool([tool, { ...tool, name: 'other_screen' }])).toThrow('唯一');
    expect(() => selectScreeningTool([{ ...tool, name: 'buy_order', description: '智能选股并下单买入委托' }])).toThrow('唯一');
    expect(() =>
      screeningArguments({ ...tool, inputSchema: { ...tool.inputSchema, required: ['query', 'newField'] } }, input),
    ).toThrow('参数定义');
  });

  it('selects the verified official screener despite default annotations and referrals from news tools', () => {
    const tools = [
      { ...mxScreener, name: 'mx_finance_search_news', description: '查询新闻资讯。按条件筛选标的用mx_stocks_screener。' },
      { ...mxScreener, name: 'mx_finance_search_notice', description: '搜索公告。按条件筛选标的用mx_stocks_screener。' },
      mxScreener,
    ];
    expect(selectScreeningTool(tools)).toBe(mxScreener);
    expect(screeningArguments(mxScreener, input)).toEqual({ query: input.query });
  });

  it('keeps encrypted provider credentials isolated and out of status and history', async () => {
    const directory = temp();
    const provider = new AiSelectionProvider(vi.fn());
    const query = vi.spyOn(provider, 'query').mockResolvedValue({ stocks: [], total: 0, warnings: [], explanation: '' });
    const store = new AiSelectionStore(directory, cipher, provider);
    store.saveKey({ platform: 'wencai', apiKey: 'wencai-secret' });
    store.saveKey({ platform: 'eastmoney', apiKey: 'eastmoney-secret' });
    await store.query(input);
    await store.query({ ...input, platform: 'eastmoney' });
    expect(query.mock.calls.map((call) => call[1])).toEqual(['wencai-secret', 'eastmoney-secret']);
    expect(JSON.stringify(store.getState())).not.toContain('secret');
    expect(readFileSync(path.join(directory, 'stock-selection', 'keys-v1.json'), 'utf8')).not.toContain('secret');
    const reloaded = new AiSelectionStore(directory, cipher, provider);
    expect(reloaded.getState().history).toHaveLength(2);
    reloaded.clearKey('wencai');
    expect(reloaded.getState().configured).toEqual({ wencai: false, eastmoney: true });
    await expect(reloaded.query(input)).rejects.toThrow('配置');
  });

  it('does not fall back to plaintext when secure storage is unavailable', () => {
    const store = new AiSelectionStore(temp(), { ...cipher, available: () => false });
    expect(() => store.saveKey({ platform: 'wencai', apiKey: 'key' })).toThrow('安全存储');
    expect(store.getState().configured.wencai).toBe(false);
  });

  it('deduplicates concurrent identical queries and preserves prior history on failure', async () => {
    const provider = new AiSelectionProvider(vi.fn());
    const query = vi.spyOn(provider, 'query').mockResolvedValue({ stocks: [], total: 0, warnings: [], explanation: '' });
    const store = new AiSelectionStore(temp(), cipher, provider);
    store.saveKey({ platform: 'wencai', apiKey: 'key' });
    const [a, b] = await Promise.all([store.query(input), store.query(input)]);
    expect(a.id).toBe(b.id);
    expect(query).toHaveBeenCalledTimes(1);
    query.mockRejectedValueOnce(new Error('断网'));
    await expect(store.query(input)).rejects.toThrow('断网');
    expect(store.getState().history).toHaveLength(1);
  });

  it('validates provider, query, limits and imported stock pool provenance', () => {
    expect(aiSelectionQuerySchema.safeParse({ ...input, platform: 'unknown' }).success).toBe(false);
    expect(aiSelectionQuerySchema.safeParse({ ...input, query: '', limit: 61 }).success).toBe(false);
    const source = {
      platform: 'wencai',
      query: input.query,
      queriedAt: '2026-09-06T00:00:00.000Z',
      snapshotId: 'aefcab37-03ed-47cc-83fa-b178474a370e',
    };
    expect(stockStrategySettingsSchema.safeParse({ ...DEFAULT_STOCK_STRATEGY_SETTINGS, selectionSource: source }).success).toBe(
      false,
    );
    expect(
      stockStrategySettingsSchema.parse({
        ...DEFAULT_STOCK_STRATEGY_SETTINGS,
        poolId: 'custom',
        symbols: ['600036'],
        selectionSource: source,
      }).selectionSource,
    ).toEqual(source);
  });
});
