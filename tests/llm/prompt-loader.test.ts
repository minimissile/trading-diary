import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PROMPT_IDS } from '../../src/shared/llm/prompt-id';
import { PromptLoader, resolvePromptsDir } from '../../src/service/llm/prompt-loader';

const temporaryDirectories: string[] = [];

function copyPrompts(targetDir: string): void {
  fs.mkdirSync(targetDir, { recursive: true });
  fs.cpSync(path.join(process.cwd(), 'src/prompts'), targetDir, { recursive: true });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe('PromptLoader', () => {
  it('解析 frontmatter 并渲染 partial 与变量', () => {
    const promptsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompts-'));
    temporaryDirectories.push(promptsDir);
    copyPrompts(promptsDir);

    const loader = new PromptLoader(promptsDir);
    const rendered = loader.render(PROMPT_IDS.RELEASE_NOTES, {
      version: '1.0.0',
      date: '2026-08-26',
      lastTagLabel: 'v0.9.0',
      commitList: '- feat: 测试',
    });

    expect(rendered.definition.id).toBe('release.notes');
    expect(rendered.system).toContain('发布说明撰写助手');
    expect(rendered.user).toContain('1.0.0');
    expect(rendered.user).toContain('- feat: 测试');
  });

  it('能定位仓库内 prompts 目录', () => {
    expect(fs.existsSync(resolvePromptsDir())).toBe(true);
  });

  it('loads portfolio ledger import prompt', () => {
    const loader = new PromptLoader(resolvePromptsDir());
    const definition = loader.load(PROMPT_IDS.PORTFOLIO_LEDGER_IMPORT_SCREENSHOT);
    expect(definition.id).toBe('portfolio.ledger.import.screenshot');
    expect(definition.responseFormat).toBe('json');
  });

  it('renders the company assistant prompt with current market context', () => {
    const loader = new PromptLoader(resolvePromptsDir());
    const rendered = loader.render(PROMPT_IDS.COMPANY_ASSISTANT, {
      currentDate: '2026-09-06T09:30:00.000Z',
      marketContext: '公司：示例公司（600000）\n最新价：10.2',
      newsContext: '[资讯1] 示例公告',
      conversationHistory: '暂无历史对话。',
      question: '这家公司靠什么赚钱？',
    });

    expect(rendered.definition.id).toBe('company.assistant');
    expect(rendered.definition.responseFormat).toBe('text');
    expect(rendered.system).toContain('上市公司研究助手');
    expect(rendered.user).toContain('最新价：10.2');
    expect(rendered.user).toContain('这家公司靠什么赚钱？');
  });
});
