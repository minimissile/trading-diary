import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PromptId } from '../../shared/llm/prompt-id';
import { LlmValidationError } from '../../shared/llm/errors';
import type { PromptDefinition, LlmResponseFormat } from '../../shared/llm/types';

function parseScalar(value: string): string | number | boolean {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/u.test(trimmed)) return Number(trimmed);
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontmatter(raw: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let currentKey: string | null = null;
  let list: string[] | null = null;

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const listMatch = /^-\s+(.+)$/u.exec(trimmed);
    if (listMatch && currentKey && list) {
      list.push(parseScalar(listMatch[1]!) as string);
      continue;
    }

    const keyMatch = /^([a-zA-Z0-9_]+):\s*(.*)$/u.exec(trimmed);
    if (!keyMatch) continue;

    currentKey = keyMatch[1]!;
    const value = keyMatch[2] ?? '';

    if (!value) {
      list = [];
      result[currentKey] = list;
      continue;
    }

    list = null;
    result[currentKey] = parseScalar(value);
  }

  return result;
}

function splitSections(body: string): { system: string; user: string } {
  const systemMatch = /## system\s*\n([\s\S]*?)(?=## user\s*\n|$)/u.exec(body);
  const userMatch = /## user\s*\n([\s\S]*?)$/u.exec(body);
  return {
    system: systemMatch?.[1]?.trim() ?? '',
    user: userMatch?.[1]?.trim() ?? '',
  };
}

function renderTemplate(template: string, variables: Record<string, string>, loader: PromptLoader): string {
  let rendered = template.replace(/\{\{>\s*([^\s}]+)\s*\}\}/gu, (_match, partialPath: string) => {
    const partialFile = partialPath.endsWith('.md') ? partialPath : `${partialPath}.md`;
    return loader.readRawPartial(partialFile).trim();
  });

  rendered = rendered.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/gu, (_match, key: string) => variables[key] ?? '');
  return rendered.trim();
}

export function resolvePromptsDir(explicitDir?: string): string {
  if (explicitDir && fs.existsSync(explicitDir)) return explicitDir;

  const candidates = [
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'prompts'),
    path.join(process.cwd(), 'out', 'service', 'prompts'),
    path.join(process.cwd(), 'src', 'prompts'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new LlmValidationError('找不到 prompts 目录');
}

export class PromptLoader {
  private readonly promptsDir: string;
  private readonly cache = new Map<PromptId, PromptDefinition>();

  constructor(promptsDir?: string) {
    this.promptsDir = resolvePromptsDir(promptsDir);
  }

  readRawPartial(relativePath: string): string {
    const filePath = path.join(this.promptsDir, relativePath);
    return fs.readFileSync(filePath, 'utf8');
  }

  load(promptId: PromptId): PromptDefinition {
    const cached = this.cache.get(promptId);
    if (cached) return cached;

    const idParts = String(promptId).split('.');
    const domain = idParts[0];
    const name = idParts[1];
    if (!domain || !name) throw new LlmValidationError(`无效的 PromptId：${promptId}`);

    const filePath = path.join(this.promptsDir, domain, `${name}.prompt.md`);
    const source = fs.readFileSync(filePath, 'utf8');
    const frontmatterMatch = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/u.exec(source);
    if (!frontmatterMatch) throw new LlmValidationError(`Prompt 缺少 frontmatter：${promptId}`);

    const meta = parseFrontmatter(frontmatterMatch[1]!);
    const sections = splitSections(frontmatterMatch[2]!);

    const definition: PromptDefinition = {
      id: promptId,
      version: Number(meta.version ?? 1),
      description: typeof meta.description === 'string' ? meta.description : '',
      model: typeof meta.model === 'string' ? meta.model : undefined,
      fallbackModels: Array.isArray(meta.fallbackModels) ? meta.fallbackModels.map(String) : [],
      temperature: Number(meta.temperature ?? 0.2),
      maxTokens: Number(meta.maxTokens ?? 2048),
      responseFormat: (meta.responseFormat as LlmResponseFormat | undefined) ?? 'text',
      systemTemplate: sections.system,
      userTemplate: sections.user,
    };

    this.cache.set(promptId, definition);
    return definition;
  }

  render(promptId: PromptId, variables: Record<string, string>): { system: string; user: string; definition: PromptDefinition } {
    const definition = this.load(promptId);
    return {
      definition,
      system: renderTemplate(definition.systemTemplate, variables, this),
      user: renderTemplate(definition.userTemplate, variables, this),
    };
  }
}
