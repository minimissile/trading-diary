import { describe, expect, it } from 'vitest';
import { assertOutputPolicy } from '../../src/service/llm/guards/output-policy';

describe('AI output policy', () => {
  it('allows a refusal that mentions a target price', () => {
    expect(() => assertOutputPolicy('我不能提供目标价，但可以整理需要核验的经营信息。')).not.toThrow();
  });

  it('blocks actionable trading and target-price language', () => {
    expect(() => assertOutputPolicy('立即买入这家公司。')).toThrow();
    expect(() => assertOutputPolicy('目标价为 25 元。')).toThrow();
  });
});
