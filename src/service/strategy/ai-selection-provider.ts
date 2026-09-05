import { randomBytes } from 'node:crypto';
import type { AiSelectionQuery, AiSelectionStock } from '../../shared/strategy/ai-selection';
import { stockStrategySymbolSchema } from '../../shared/schemas/requests/stock-strategy.requests';

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
const secretField = /api.?key|token|authorization|password|secret/iu;
const codeField = /^(?:股票代码|证券代码|代码|证券编码|stock_?code|security_?code|secu_?code|code|symbol|thscode)$/iu;
const nameField = /^(?:股票简称|股票名称|证券简称|证券名称|名称|简称|stock_?name|security_?name|secu_?name|name)$/iu;
const cleanLabel = (label: string): string => label.replace(/\[.*?\]|\(.*?\)|（.*?）/gu, '').trim();

function normalizedSymbol(value: unknown): string | null {
  if (typeof value !== 'string') return null; // Never turn a price or numeric ID into a stock code.
  const text = value.trim().toUpperCase();
  const match = /^(?:(SH|SZ)[.:]?)?(\d{6})(?:[.](SH|SZ))?$/u.exec(text);
  if (!match || !stockStrategySymbolSchema.safeParse(match[2]).success) return null;
  const symbol = match[2]!;
  const venue = symbol.startsWith('6') ? 'SH' : 'SZ';
  if ((match[1] && match[1] !== venue) || (match[3] && match[3] !== venue)) return null;
  return symbol;
}

function stockFromRow(row: JsonObject): AiSelectionStock | null {
  const entries = Object.entries(row);
  const symbol = normalizedSymbol(entries.find(([key]) => codeField.test(cleanLabel(key)))?.[1]);
  if (!symbol) return null;
  const name = entries.find(([key]) => nameField.test(cleanLabel(key)))?.[1];
  const metrics = entries.filter(([key, value]) => !codeField.test(cleanLabel(key)) && !nameField.test(cleanLabel(key)) && !secretField.test(key) && ['string', 'number', 'boolean'].includes(typeof value))
    .slice(0, 24).map(([label, value]) => ({ label: label.slice(0, 120), value: String(value).slice(0, 300) }));
  return { symbol, name: typeof name === 'string' && name.trim() ? name.slice(0, 80) : symbol, metrics };
}

/** Only interpret structured rows / explicit Markdown tables, never infer tickers from prose. */
export function parseSelectionPayload(payload: unknown, limit: number): { stocks: AiSelectionStock[]; total: number | null; explanation: string; warnings: string[] } {
  const rows: JsonObject[] = [];
  const explanations: string[] = [];
  let recognized = false;
  let total: number | null = null;
  const visit = (value: unknown, depth = 0): void => {
    if (depth > 8) return;
    if (Array.isArray(value)) { value.slice(0, 3000).forEach(item => visit(item, depth + 1)); return; }
    if (typeof value === 'string') {
      const text = value.trim();
      try { visit(JSON.parse(text.replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '')), depth + 1); return; } catch { /* Plain text is a valid MCP response. */ }
      const lines = text.split('\n');
      for (let i = 0; i < lines.length - 1; i++) {
        const cells = (line: string): string[] => line.trim().replace(/^\||\|$/gu, '').split('|').map(cell => cell.trim().replace(/^\*\*|\*\*$/gu, ''));
        const headers = cells(lines[i]!);
        if (!headers.some(header => codeField.test(cleanLabel(header))) || !/^\s*\|?[\s:|-]+\|?\s*$/u.test(lines[i + 1]!)) continue;
        recognized = true;
        i += 2;
        while (i < lines.length && lines[i]!.includes('|')) {
          const values = cells(lines[i]!);
          rows.push(Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
          i++;
        }
      }
      if (text) explanations.push(text.slice(0, 4000));
      return;
    }
    const item = object(value);
    if (!item) return;
    if (Object.keys(item).some(key => codeField.test(cleanLabel(key)))) { recognized = true; rows.push(item); return; }
    for (const field of ['code_count', 'total', 'totalCount', 'total_count']) {
      if (typeof item[field] === 'number' && Number.isFinite(item[field]) && item[field] >= 0) total = item[field];
    }
    for (const field of ['datas', 'data', 'rows', 'records', 'stocks', 'list', 'result', 'results', 'table', 'tables', 'structuredContent', 'content', 'text']) {
      if (!(field in item)) continue;
      if (Array.isArray(item[field]) && field !== 'content') recognized = true;
      visit(item[field], depth + 1);
    }
  };
  visit(payload);
  const stocks = [...new Map(rows.map(stockFromRow).filter((row): row is AiSelectionStock => row !== null).map(row => [row.symbol, row])).values()];
  if (!recognized && total !== 0) throw new Error('平台未返回可识别的股票表格，请在条件中明确要求“返回沪深 A 股股票代码、股票简称及筛选指标”后重试');
  const warnings: string[] = [];
  const excluded = rows.filter(row => stockFromRow(row) === null).length;
  if (excluded) warnings.push(`${excluded} 条结果没有有效的沪深 A 股股票代码，未导入（不支持北交所、港美股、基金）。`);
  if ((total ?? stocks.length) > limit || stocks.length > limit) warnings.push(`按平台返回顺序保留前 ${limit} 只有效沪深股票；不是全市场完整结果。`);
  return { stocks: stocks.slice(0, limit), total, explanation: explanations.join('\n\n').slice(0, 6000), warnings };
}

export class AiSelectionProvider {
  constructor(private readonly request: typeof fetch = fetch) {}

  private async post(url: string, headers: Record<string, string>, body: unknown, signal: AbortSignal): Promise<{ response: Response; text: string }> {
    let response: Response;
    try {
      response = await this.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), redirect: 'error', signal });
    } catch {
      throw new Error(signal.aborted ? '平台请求超时，请稍后重试' : '平台连接失败，请检查网络后重试');
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(response.status === 401 || response.status === 403 ? '平台认证失败，请检查 API Key 与接口权限' : response.status === 429 ? '平台调用额度不足或请求过于频繁，请稍后重试' : `平台暂不可用（HTTP ${response.status}）`);
    }
    const reader = response.body?.getReader();
    if (!reader) return { response, text: '' };
    const decoder = new TextDecoder();
    let text = '';
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 4_000_000) throw new Error('平台响应过大，请缩小选股范围');
        text += decoder.decode(part.value, { stream: true });
        // MCP servers may keep an SSE stream open after the JSON-RPC result.
        if (response.headers.get('content-type')?.includes('text/event-stream') && sseResult(text, object(body)?.id) !== undefined) break;
      }
      text += decoder.decode();
      return { response, text };
    } finally { await reader.cancel().catch(() => undefined); }
  }

  async query(input: AiSelectionQuery, apiKey: string): Promise<ReturnType<typeof parseSelectionPayload>> {
    const signal = AbortSignal.timeout(120_000);
    try {
      return input.platform === 'wencai' ? await this.wencai(input, apiKey, signal) : await this.eastmoney(input, apiKey, signal);
    } catch (error) {
      // Remote errors must never echo credentials or request headers back into renderer/logs.
      const message = error instanceof Error ? error.message : '选股请求失败';
      throw new Error(message.split(apiKey).join('[已隐藏]').slice(0, 800));
    }
  }

  private async wencai(input: AiSelectionQuery, apiKey: string, signal: AbortSignal): Promise<ReturnType<typeof parseSelectionPayload>> {
    const { text } = await this.post('https://openapi.iwencai.com/v1/query2data', {
      Authorization: `Bearer ${apiKey}`, 'X-Claw-Call-Type': 'normal',
      'X-Claw-Skill-Id': 'hithink-astock-selector', 'X-Claw-Skill-Version': '1.0.0',
      'X-Claw-Plugin-Id': 'none', 'X-Claw-Plugin-Version': 'none', 'X-Claw-Trace-Id': randomBytes(32).toString('hex'),
    }, { query: input.query, page: '1', limit: String(input.limit), is_cache: '1', expand_index: 'true' }, signal);
    let result: JsonObject | null;
    try { result = object(JSON.parse(text.split(apiKey).join('[已隐藏]'))); } catch { throw new Error('问财返回格式异常，请稍后重试'); }
    if (!result) throw new Error('问财未返回有效数据');
    if ((result.status_code !== undefined && Number(result.status_code) !== 0) || result.error) throw new Error(`问财查询失败：${String(result.status_msg ?? result.error ?? '请检查接口权限和额度')}`);
    return parseSelectionPayload(result, input.limit);
  }

  private async eastmoney(input: AiSelectionQuery, apiKey: string, signal: AbortSignal): Promise<ReturnType<typeof parseSelectionPayload>> {
    const headers: Record<string, string> = { em_api_key: apiKey, Accept: 'application/json, text/event-stream' };
    let id = 0;
    const rpc = async (method: string, params: unknown, notification = false): Promise<JsonObject> => {
      const requestId = notification ? undefined : ++id;
      const { response, text } = await this.post('https://mxapi.eastmoney.com/mxds/mcp', headers, { jsonrpc: '2.0', ...(notification ? {} : { id: requestId }), method, params }, signal);
      const session = response.headers.get('mcp-session-id');
      if (session) headers['Mcp-Session-Id'] = session;
      if (notification && !text.trim()) return {};
      let payload: JsonObject | null;
      const redacted = text.split(apiKey).join('[已隐藏]');
      try { payload = object(response.headers.get('content-type')?.includes('text/event-stream') ? sseResult(redacted, requestId) : JSON.parse(redacted)); } catch { throw new Error('妙想返回格式异常，请稍后重试'); }
      if (!payload) throw new Error('妙想未返回有效数据');
      if (payload.error) throw new Error(`妙想查询失败：${String(object(payload.error)?.message ?? payload.error)}`);
      if (notification) return {};
      if (payload.id !== requestId || !object(payload.result)) throw new Error('妙想接口响应不完整，请检查接口权限');
      return object(payload.result)!;
    };
    const initialized = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'trading-diary', version: '1.0.0' } });
    if (typeof initialized.protocolVersion !== 'string') throw new Error('妙想协议初始化失败');
    headers['MCP-Protocol-Version'] = initialized.protocolVersion;
    await rpc('notifications/initialized', {}, true);
    const tools: JsonObject[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page++) {
      const listed = await rpc('tools/list', cursor ? { cursor } : {});
      if (!Array.isArray(listed.tools)) throw new Error('妙想没有返回可用工具列表');
      tools.push(...listed.tools.map(object).filter((item): item is JsonObject => item !== null));
      cursor = typeof listed.nextCursor === 'string' ? listed.nextCursor : undefined;
      if (!cursor) break;
    }
    const tool = selectScreeningTool(tools);
    const result = await rpc('tools/call', { name: tool.name, arguments: screeningArguments(tool, input) });
    if (result.isError) throw new Error('妙想选股未成功，请检查 API Key 权限、额度或调整查询条件后重试');
    return parseSelectionPayload(result, input.limit);
  }
}

function sseResult(text: string, id: unknown): unknown {
  for (const event of text.replace(/\r\n/gu, '\n').split('\n\n').slice(0, -1)) {
    const data = event.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    try { const value: unknown = JSON.parse(data); if (object(value)?.id === id && id !== undefined) return value; } catch { /* Heartbeats and other events are ignored. */ }
  }
  return undefined;
}

export function selectScreeningTool(tools: JsonObject[]): JsonObject {
  const selected = tools.filter(tool => typeof tool.name === 'string' && /xuangu|stock[_-]?(?:screen|select)|(?:screen|select)[_-]?stock|智能选股|条件选股/iu.test(`${tool.name} ${String(tool.description ?? '')}`) && !/模拟交易|下单|买入委托|sell_order|buy_order|place_order/iu.test(`${tool.name} ${String(tool.description ?? '')}`));
  if (selected.length !== 1) throw new Error('妙想未提供唯一可识别的智能选股工具，请检查账号权限或等待接口适配更新');
  return selected[0]!;
}

export function screeningArguments(tool: JsonObject, input: AiSelectionQuery): JsonObject {
  const schema = object(tool.inputSchema);
  const properties = object(schema?.properties);
  if (!properties) throw new Error('妙想选股工具缺少参数定义');
  const args: JsonObject = {};
  let hasQuery = false;
  for (const [key, value] of Object.entries(properties)) {
    const property = object(value);
    if (!property) continue;
    if (/^(query|question|keyword|prompt|search_query|searchstring|query_text|queryText)$/u.test(key) && property.type === 'string') { args[key] = input.query; hasQuery = true; }
    else if (/^(limit|page_size|pageSize|size|top_n)$/u.test(key) && ['number', 'integer'].includes(String(property.type))) args[key] = input.limit;
    else if ('default' in property) args[key] = property.default;
  }
  if (!hasQuery || (Array.isArray(schema?.required) && schema.required.some(key => typeof key !== 'string' || !(key in args)))) throw new Error('妙想选股参数定义已变化，暂无法安全构造查询，请等待接口适配更新');
  return args;
}
