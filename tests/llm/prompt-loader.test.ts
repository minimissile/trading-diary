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
});
