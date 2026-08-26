export class LlmError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'LlmError';
    this.code = code;
  }
}

export class LlmNotConfiguredError extends LlmError {
  constructor(message = '未配置 OpenRouter API Key') {
    super('LLM_NOT_CONFIGURED', message);
    this.name = 'LlmNotConfiguredError';
  }
}

export class LlmProviderError extends LlmError {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super('LLM_PROVIDER_ERROR', message);
    this.name = 'LlmProviderError';
    this.status = status;
  }
}

export class LlmValidationError extends LlmError {
  constructor(message: string) {
    super('LLM_VALIDATION_ERROR', message);
    this.name = 'LlmValidationError';
  }
}

export class LlmPolicyViolationError extends LlmError {
  constructor(message: string) {
    super('LLM_POLICY_VIOLATION', message);
    this.name = 'LlmPolicyViolationError';
  }
}

export class LlmBudgetExceededError extends LlmError {
  constructor(message = '本月 token 预算已用尽') {
    super('LLM_BUDGET_EXCEEDED', message);
    this.name = 'LlmBudgetExceededError';
  }
}

export function isLlmNotConfigured(error: unknown): error is LlmNotConfiguredError {
  if (error instanceof LlmNotConfiguredError) return true;
  if (error instanceof LlmError && error.code === 'LLM_NOT_CONFIGURED') return true;
  if (error instanceof Error && error.message.includes('LLM_NOT_CONFIGURED')) return true;
  return false;
}

export function isLlmBudgetExceeded(error: unknown): boolean {
  if (error instanceof LlmBudgetExceededError) return true;
  if (error instanceof LlmError && error.code === 'LLM_BUDGET_EXCEEDED') return true;
  if (error instanceof Error && error.message.includes('LLM_BUDGET_EXCEEDED')) return true;
  return false;
}
