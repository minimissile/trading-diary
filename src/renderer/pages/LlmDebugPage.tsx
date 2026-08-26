import { useRef, useState } from 'react';
import { App, Button, Input, Select, Space } from 'antd';
import { PROMPT_IDS } from '../../shared/llm/prompt-id';
import { aiClient } from '../lib/ai/ai-client';
import { getLlmErrorMessage } from '../lib/ai/llm-errors';

const promptOptions = [
  { label: 'review.summarize', value: PROMPT_IDS.REVIEW_SUMMARIZE },
  { label: 'release.notes', value: PROMPT_IDS.RELEASE_NOTES },
  { label: 'release.plan', value: PROMPT_IDS.RELEASE_PLAN },
];

const defaultVariables: Record<string, Record<string, string>> = {
  [PROMPT_IDS.REVIEW_SUMMARIZE]: {
    symbol: '600519',
    title: '贵州茅台回踩复盘',
    directionLabel: '做多',
    plannedLabel: '是',
    entryPrice: '1450',
    exitPrice: '1488',
    quantity: '100',
    fees: '12',
    pnl: '3788',
    executionScore: '4',
    planContext: '',
    partialAnswers: '',
  },
  [PROMPT_IDS.RELEASE_NOTES]: {
    version: '1.2.1',
    date: '2026-08-26',
    lastTagLabel: 'v1.2.0',
    commitList: '- feat: AI 流式输出',
  },
  [PROMPT_IDS.RELEASE_PLAN]: {
    currentVersion: '1.2.0',
    date: '2026-08-26',
    lastTagLabel: 'v1.2.0',
    commitList: '- feat: AI 流式输出',
  },
};

export function LlmDebugPage(): React.JSX.Element {
  const { message } = App.useApp();
  const [promptId, setPromptId] = useState<string>(PROMPT_IDS.REVIEW_SUMMARIZE);
  const [variablesText, setVariablesText] = useState(JSON.stringify(defaultVariables[PROMPT_IDS.REVIEW_SUMMARIZE], null, 2));
  const [previewSystem, setPreviewSystem] = useState('');
  const [previewUser, setPreviewUser] = useState('');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);

  const parseVariables = (): Record<string, string> | null => {
    try {
      const parsed = JSON.parse(variablesText) as Record<string, unknown>;
      const normalized: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) normalized[key] = String(value);
      return normalized;
    } catch {
      void message.error('变量 JSON 格式无效');
      return null;
    }
  };

  const preview = async (): Promise<void> => {
    const variables = parseVariables();
    if (!variables) return;
    setBusy(true);
    try {
      const previewResult = await aiClient.previewPrompt(promptId, variables);
      setPreviewSystem(previewResult.system);
      setPreviewUser(previewResult.user);
    } catch (reason) {
      void message.error(getLlmErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const runStream = async (): Promise<void> => {
    const variables = parseVariables();
    if (!variables) return;
    setBusy(true);
    setOutput('');
    try {
      const session = await aiClient.debugRunStream(promptId, variables, {
        onChunk: (delta) => setOutput((current) => current + delta),
        onDone: () => {
          cancelRef.current = null;
          setBusy(false);
          void message.success('调试运行完成');
        },
        onError: (error) => {
          cancelRef.current = null;
          setBusy(false);
          void message.error(`${error.code}: ${error.message}`);
        },
      });
      cancelRef.current = session.cancel;
    } catch (reason) {
      setBusy(false);
      void message.error(getLlmErrorMessage(reason));
    }
  };

  return (
    <main className="workspace-page">
      <header className="page-header">
        <div>
          <p className="page-kicker">DEV ONLY</p>
          <h1>Prompt 调试面板</h1>
          <p className="page-intro">预览渲染后的 system / user 提示词，并以流式方式调用 LlmRunner。</p>
        </div>
      </header>

      <section className="settings-panel">
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Select
            style={{ width: 320 }}
            options={promptOptions}
            value={promptId}
            onChange={(value) => {
              setPromptId(value);
              setVariablesText(JSON.stringify(defaultVariables[value] ?? {}, null, 2));
            }}
          />
          <Input.TextArea rows={10} value={variablesText} onChange={(event) => setVariablesText(event.target.value)} />
          <Space wrap>
            <Button loading={busy} onClick={() => void preview()}>
              预览 Prompt
            </Button>
            <Button type="primary" loading={busy} onClick={() => void runStream()}>
              流式运行
            </Button>
            <Button
              disabled={!busy}
              onClick={() => {
                cancelRef.current?.();
                cancelRef.current = null;
                setBusy(false);
              }}
            >
              取消
            </Button>
          </Space>
          {previewSystem ? (
            <>
              <h3>System</h3>
              <pre className="ai-stream-preview">{previewSystem}</pre>
              <h3>User</h3>
              <pre className="ai-stream-preview">{previewUser}</pre>
            </>
          ) : null}
          {output ? (
            <>
              <h3>Output</h3>
              <pre className="ai-stream-preview">{output}</pre>
            </>
          ) : null}
        </Space>
      </section>
    </main>
  );
}
