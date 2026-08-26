import type {
  ReviewAiDraftInput,
  ReviewAiDraftResult,
  LlmConnectionTestResult,
  LlmStatusResult,
} from '../../../shared/api.types';

export const aiClient = {
  getLlmStatus(): Promise<LlmStatusResult> {
    return window.desktop.settings.getLlmStatus();
  },

  saveLlmApiKey(apiKey: string): Promise<LlmStatusResult> {
    return window.desktop.settings.saveLlmApiKey(apiKey);
  },

  testLlmConnection(): Promise<LlmConnectionTestResult> {
    return window.desktop.settings.testLlmConnection();
  },

  generateReviewDraft(input: ReviewAiDraftInput): Promise<ReviewAiDraftResult> {
    return window.desktop.reviews.generateAiDraft(input);
  },
};
