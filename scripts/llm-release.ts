import { PROMPT_IDS } from '../src/shared/llm/prompt-id.ts';
import { releasePlanOutputSchema } from '../src/shared/llm/llm.schemas.ts';
import { createLlmRunner } from '../src/service/llm/llm-runner.ts';

export async function generateReleasePlanWithLlm(currentVersion: string, lastTag: string | null, commits: string[]) {
  const date = new Date().toISOString().slice(0, 10);
  const commitList = commits.length
    ? commits.map((subject) => `- ${subject}`).join('\n')
    : '- （无新提交，建议 patch 维护性发布）';

  const runner = createLlmRunner();
  const result = await runner.run(PROMPT_IDS.RELEASE_PLAN, {
    currentVersion,
    lastTagLabel: lastTag ?? '无（首次发布）',
    commitList,
    date,
  });

  const jsonText = result.content
    .replace(/^```(?:json)?\s*/iu, '')
    .replace(/\s*```$/iu, '')
    .trim();
  const parsed = releasePlanOutputSchema.parse(JSON.parse(jsonText));

  return {
    bump: parsed.bump,
    bumpReason: parsed.bumpReason,
    releaseNotes: parsed.releaseNotes,
  };
}

export async function generateReleaseNotesWithLlm(version: string, lastTag: string | null, commits: string[]) {
  const date = new Date().toISOString().slice(0, 10);
  const commitList = commits.length ? commits.map((subject) => `- ${subject}`).join('\n') : '- （无新提交，仅为维护性发布）';

  const runner = createLlmRunner();
  const result = await runner.run(PROMPT_IDS.RELEASE_NOTES, {
    version,
    lastTagLabel: lastTag ?? '首次发布',
    commitList,
    date,
  });

  return result.content.endsWith('\n') ? result.content : `${result.content}\n`;
}
