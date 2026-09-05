import {
  BulbOutlined,
  DeleteOutlined,
  LinkOutlined,
  RobotOutlined,
  SendOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { Alert, Button, Drawer, Input, Skeleton, Tag } from 'antd';
import { useEffect, useRef, useState } from 'react';
import type {
  CompanyAssistantHistoryMessage,
  CompanyAssistantResult,
  InstrumentInfo,
} from '../../../shared/api.types';
import { labelForVenue } from '../../../shared/market/venues';
import { aiClient } from '../../lib/ai/ai-client';
import { getLlmErrorMessage } from '../../lib/ai/llm-errors';
import { SymbolSearchInput } from './SymbolSearchInput';

const QUICK_QUESTIONS = ['这家公司靠什么赚钱？', '近期股民最关注什么？', '主要风险有哪些？', '帮我做一份公司速览'];

interface CompanyAssistantDrawerProps {
  open: boolean;
  onClose: () => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  result?: CompanyAssistantResult;
}

function quoteText(value: number | null, suffix = ''): string {
  return value === null ? '—' : `${value}${suffix}`;
}

function CompanyAssistantDrawer({ open, onClose }: CompanyAssistantDrawerProps): React.JSX.Element {
  const [symbol, setSymbol] = useState('');
  const [company, setCompany] = useState<InstrumentInfo | null>(null);
  const [resolving, setResolving] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestResult, setLatestResult] = useState<CompanyAssistantResult | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const requestSequence = useRef(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const resolvedSymbolRef = useRef<string | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: loading ? 'auto' : 'smooth', block: 'end' });
  }, [loading, messages, streamingText]);

  useEffect(
    () => () => {
      cancelRef.current?.();
    },
    [],
  );

  const cancelRequest = (): void => {
    requestSequence.current += 1;
    cancelRef.current?.();
    cancelRef.current = null;
    setLoading(false);
    setStreamingText('');
  };

  const clearConversation = (): void => {
    cancelRequest();
    setMessages([]);
    setLatestResult(null);
    setError(null);
  };

  const selectCompany = (instrument: InstrumentInfo | null): void => {
    setResolving(false);
    resolvedSymbolRef.current = instrument?.kind === 'stock' ? instrument.symbol : null;
    setCompany(instrument?.kind === 'stock' ? instrument : null);
    if (!instrument) setError('没有找到这家上市公司，请从搜索建议中选择');
    else if (instrument.kind !== 'stock') setError('公司助手当前只支持上市公司');
    else setError(null);
  };

  const ask = async (nextQuestion = question): Promise<void> => {
    const trimmed = nextQuestion.trim();
    if (!company) {
      setError('请先选择一家上市公司');
      return;
    }
    if (!trimmed || loading) return;

    const sequence = ++requestSequence.current;
    const history: CompanyAssistantHistoryMessage[] = messages.slice(-8).map(({ role, content }) => ({ role, content }));
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: trimmed };
    setMessages((current) => [...current, userMessage]);
    setQuestion('');
    setStreamingText('');
    setError(null);
    setLoading(true);

    try {
      const session = await aiClient.askCompanyStream(
        { symbol: company.symbol, question: trimmed, history },
        {
          onChunk: (delta) => {
            if (requestSequence.current === sequence) setStreamingText((current) => current + delta);
          },
          onDone: (result) => {
            if (requestSequence.current !== sequence) return;
            cancelRef.current = null;
            setLoading(false);
            setStreamingText('');
            setLatestResult(result);
            setMessages((current) => [
              ...current,
              { id: crypto.randomUUID(), role: 'assistant', content: result.answer, result },
            ]);
          },
          onError: (streamError) => {
            if (requestSequence.current !== sequence) return;
            cancelRef.current = null;
            setLoading(false);
            setStreamingText('');
            setError(getLlmErrorMessage(new Error(`${streamError.code}: ${streamError.message}`)));
          },
        },
      );
      if (requestSequence.current === sequence) cancelRef.current = session.cancel;
      else session.cancel();
    } catch (reason) {
      if (requestSequence.current !== sequence) return;
      cancelRef.current = null;
      setLoading(false);
      setStreamingText('');
      setError(getLlmErrorMessage(reason));
    }
  };

  return (
    <Drawer
      className="company-assistant-drawer"
      open={open}
      width="min(540px, 100vw)"
      mask={false}
      onClose={() => {
        cancelRequest();
        onClose();
      }}
      title={
        <div className="company-assistant-title">
          <span className="company-assistant-title__icon">
            <RobotOutlined />
          </span>
          <div>
            <strong>AI 公司助手</strong>
            <small>行情与资讯辅助研究</small>
          </div>
        </div>
      }
      extra={
        <Button
          className="ui-icon-button"
          type="text"
          icon={<DeleteOutlined />}
          aria-label="清空对话"
          title="清空对话"
          disabled={!messages.length && !streamingText}
          onClick={clearConversation}
        />
      }
    >
      <div className="company-assistant-company">
        <label htmlFor="company-assistant-symbol">选择上市公司</label>
        <SymbolSearchInput
          id="company-assistant-symbol"
          value={symbol}
          assetKind="stock"
          marketScopes={['CN_A', 'HK', 'US']}
          placeholder="输入公司名称或代码，如 宁德时代、AAPL"
          disabled={loading}
          onChange={(value) => {
            if (value.trim().toUpperCase() !== resolvedSymbolRef.current) {
              resolvedSymbolRef.current = null;
              setCompany(null);
              setLatestResult(null);
              setMessages([]);
            }
            setSymbol(value);
            setError(null);
          }}
          onResolveStart={() => setResolving(true)}
          onResolve={selectCompany}
        />
        {resolving ? <Skeleton.Input active size="small" block /> : null}
        {company ? (
          <div className="company-assistant-company__resolved">
            <div>
              <strong>{company.name}</strong>
              <span>{company.symbol}</span>
              <Tag>{labelForVenue(company.venue)}</Tag>
            </div>
            {latestResult ? (
              <div className="company-assistant-quote" aria-label="最新行情摘要">
                <span>现价 {quoteText(latestResult.quote.price)}</span>
                <span>PE {quoteText(latestResult.quote.peTtm)}</span>
                <span>PB {quoteText(latestResult.quote.pb)}</span>
                <span>股息率 {quoteText(latestResult.quote.dividendYieldTtm, '%')}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="company-assistant-chat" aria-live="polite">
        {!messages.length && !streamingText ? (
          <div className="company-assistant-empty">
            <RobotOutlined />
            <strong>选一家公司，问你真正关心的问题</strong>
            <p>助手会结合最新行情、估值字段与近期资讯作答，并把模型知识和待核验内容分开标记。</p>
          </div>
        ) : null}

        {messages.map((message) => (
          <article className={`company-assistant-message company-assistant-message--${message.role}`} key={message.id}>
            <span>{message.role === 'user' ? '你' : <RobotOutlined />}</span>
            <div>
              <div className="company-assistant-answer">{message.content}</div>
              {message.result?.sources.length ? (
                <details className="company-assistant-sources">
                  <summary>本次参考资讯 · {message.result.sources.length} 条</summary>
                  <ol>
                    {message.result.sources.map((source) => (
                      <li key={source.id}>
                        <button
                          type="button"
                          disabled={!source.url}
                          onClick={() => {
                            if (source.url) void window.desktop.system.openExternal(source.url);
                          }}
                        >
                          <span>[资讯{source.id}] {source.title}</span>
                          {source.publishedAt ? <small>{source.publishedAt}</small> : null}
                          {source.url ? <LinkOutlined /> : null}
                        </button>
                      </li>
                    ))}
                  </ol>
                </details>
              ) : null}
            </div>
          </article>
        ))}

        {loading ? (
          <article className="company-assistant-message company-assistant-message--assistant company-assistant-message--streaming">
            <span><RobotOutlined /></span>
            <div className="company-assistant-answer">
              {streamingText || '正在读取行情和近期资讯…'}
              <i aria-hidden="true" />
            </div>
          </article>
        ) : null}
        <div ref={chatEndRef} />
      </div>

      <div className="company-assistant-composer">
        {error ? <Alert type="error" showIcon title={error} closable onClose={() => setError(null)} /> : null}
        <div className="company-assistant-quick-questions" aria-label="快捷问题">
          <BulbOutlined />
          {QUICK_QUESTIONS.map((item) => (
            <Button key={item} size="small" disabled={!company || loading} onClick={() => void ask(item)}>
              {item}
            </Button>
          ))}
        </div>
        <div className="company-assistant-input-row">
          <Input.TextArea
            value={question}
            autoSize={{ minRows: 2, maxRows: 5 }}
            maxLength={1_000}
            placeholder={company ? `继续询问 ${company.name}…` : '请先选择一家上市公司'}
            disabled={!company || loading}
            onChange={(event) => setQuestion(event.target.value)}
            onPressEnter={(event) => {
              if (!event.shiftKey) {
                event.preventDefault();
                void ask();
              }
            }}
          />
          {loading ? (
            <Button icon={<StopOutlined />} aria-label="停止生成" title="停止生成" onClick={cancelRequest} />
          ) : (
            <Button
              type="primary"
              icon={<SendOutlined />}
              aria-label="发送问题"
              title="发送问题"
              disabled={!company || !question.trim()}
              onClick={() => void ask()}
            />
          )}
        </div>
        <small className="company-assistant-disclaimer">AI 可能出错；重要信息请以公司公告和定期报告为准，不构成投资建议。</small>
      </div>
    </Drawer>
  );
}

export default CompanyAssistantDrawer;
