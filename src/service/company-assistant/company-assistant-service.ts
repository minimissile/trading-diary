import type {
  CompanyAssistantAskInput,
  CompanyAssistantHistoryMessage,
  CompanyAssistantResult,
} from '../../shared/ai/company-assistant';
import { PROMPT_IDS } from '../../shared/llm/prompt-id';
import { labelForVenue } from '../../shared/market/venues';
import type { LlmRunner } from '../llm/llm-runner';
import { marketService } from '../market/market-service';

function displayValue(value: number | null, suffix = ''): string {
  return value === null ? '暂无数据' : `${value}${suffix}`;
}

function buildHistory(messages: CompanyAssistantHistoryMessage[]): string {
  if (!messages.length) return '暂无历史对话。';
  return messages
    .slice(-8)
    .map((message) => `${message.role === 'user' ? '用户' : '助手'}：${message.content.trim()}`)
    .join('\n');
}

export async function generateCompanyAnswerStream(
  llmRunner: LlmRunner,
  input: CompanyAssistantAskInput,
  handlers: { onChunk: (delta: string) => void; streamId: string },
): Promise<CompanyAssistantResult> {
  const [snapshot, news] = await Promise.all([
    marketService.getSnapshot(input.symbol),
    marketService.listNews(input.symbol, 8).catch(() => []),
  ]);

  if (snapshot.instrument.kind !== 'stock') {
    throw new Error('AI 公司助手当前仅支持上市公司，不支持基金或 ETF');
  }

  const sources = news.map((item, index) => ({ id: index + 1, ...item }));
  const quote = snapshot.quote;
  const marketContext = [
    `公司：${snapshot.instrument.name}（${snapshot.instrument.symbol}）`,
    `上市市场：${labelForVenue(snapshot.instrument.venue)}，币种：${snapshot.instrument.quoteCurrency}`,
    `最新价：${displayValue(quote.price)}`,
    `涨跌幅：${displayValue(quote.changePercent, '%')}`,
    `当日开盘/最高/最低：${displayValue(quote.open)} / ${displayValue(quote.high)} / ${displayValue(quote.low)}`,
    `市盈率（TTM）：${displayValue(quote.peTtm)}`,
    `市净率：${displayValue(quote.pb)}`,
    `股息率（TTM）：${displayValue(quote.dividendYieldTtm, '%')}`,
    `行情来源：${quote.source}，获取时间：${quote.fetchedAt}`,
    snapshot.upcomingDividends.length
      ? `近期分红事件：${snapshot.upcomingDividends
          .map((item) => `${item.planText}（${item.progress || item.status}，公告日 ${item.noticeDate ?? '未知'}）`)
          .join('；')}`
      : '近期分红事件：暂无数据',
  ].join('\n');
  const newsContext = sources.length
    ? sources
        .map(
          (item) =>
            `[资讯${item.id}] ${item.title}｜发布时间：${item.publishedAt ?? '未知'}${item.summary ? `｜摘要：${item.summary}` : ''}`,
        )
        .join('\n')
    : '暂无可用的近期公司资讯。';

  const result = await llmRunner.runStream(
    PROMPT_IDS.COMPANY_ASSISTANT,
    {
      currentDate: new Date().toISOString(),
      marketContext,
      newsContext,
      conversationHistory: buildHistory(input.history),
      question: input.question.trim(),
    },
    handlers.onChunk,
    handlers.streamId,
  );

  return {
    answer: result.content.trim(),
    company: {
      symbol: snapshot.instrument.symbol,
      name: snapshot.instrument.name,
      venue: snapshot.instrument.venue,
      quoteCurrency: snapshot.instrument.quoteCurrency,
    },
    quote: {
      price: quote.price,
      changePercent: quote.changePercent,
      peTtm: quote.peTtm,
      pb: quote.pb,
      dividendYieldTtm: quote.dividendYieldTtm,
      fetchedAt: quote.fetchedAt,
    },
    sources,
    generatedAt: new Date().toISOString(),
  };
}
