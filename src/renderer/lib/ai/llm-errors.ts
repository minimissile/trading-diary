export { isLlmNotConfigured, isLlmBudgetExceeded, LlmError, LlmNotConfiguredError } from '../../../shared/llm/errors';

export function getLlmErrorMessage(error: unknown, fallback = 'AI 服务暂时不可用'): string {
  if (error instanceof Error) {
    if (error.message.includes('LLM_NOT_CONFIGURED') || error.message.includes('未配置 OpenRouter')) {
      return '请先在设置中配置 OpenRouter API Key';
    }
    if (error.message.includes('LLM_BUDGET_EXCEEDED')) {
      return '本月 token 预算已用尽，可在设置中调整';
    }
    if (error.message.includes('LLM_PROVIDER_ERROR') || error.message.includes('OpenRouter')) {
      return '连接 AI 服务失败，请稍后重试';
    }
    if (error.message.includes('LLM_POLICY_VIOLATION')) {
      return 'AI 草稿未通过合规检查，请手动填写';
    }
    return error.message || fallback;
  }
  return fallback;
}
