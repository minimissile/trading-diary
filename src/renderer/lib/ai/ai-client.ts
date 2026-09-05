import type {
  CompanyAssistantAskInput,
  CompanyAssistantResult,
  LlmConnectionTestResult,
  LlmDebugRunResult,
  LlmPromptPreview,
  LlmStatusResult,
  LlmUsageSummary,
  LlmUserSettings,
  ReviewAiDraftInput,
  ReviewAiDraftResult,
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

  getLlmUsage(): Promise<LlmUsageSummary> {
    return window.desktop.settings.getLlmUsage();
  },

  getLlmSettings(): Promise<LlmUserSettings> {
    return window.desktop.settings.getLlmSettings();
  },

  saveLlmSettings(settings: LlmUserSettings): Promise<LlmUserSettings> {
    return window.desktop.settings.saveLlmSettings(settings);
  },

  generateReviewDraft(input: ReviewAiDraftInput): Promise<ReviewAiDraftResult> {
    return window.desktop.reviews.generateAiDraft(input);
  },

  generateReviewDraftStream(
    input: ReviewAiDraftInput,
    listeners: {
      onChunk: (delta: string) => void;
      onDone: (result: ReviewAiDraftResult) => void;
      onError: (error: { code: string; message: string }) => void;
    },
  ): Promise<{ streamId: string; cancel: () => void }> {
    return window.desktop.reviews.generateAiDraftStream(input, listeners);
  },

  askCompanyStream(
    input: CompanyAssistantAskInput,
    listeners: {
      onChunk: (delta: string) => void;
      onDone: (result: CompanyAssistantResult) => void;
      onError: (error: { code: string; message: string }) => void;
    },
  ): Promise<{ streamId: string; cancel: () => void }> {
    return window.desktop.companyAssistant.askStream(input, listeners);
  },

  previewPrompt(promptId: string, variables: Record<string, string>): Promise<LlmPromptPreview> {
    return window.desktop.llm.previewPrompt(promptId, variables);
  },

  debugRunStream(
    promptId: string,
    variables: Record<string, string>,
    listeners: {
      onChunk: (delta: string) => void;
      onDone: (result: LlmDebugRunResult) => void;
      onError: (error: { code: string; message: string }) => void;
    },
  ): Promise<{ streamId: string; cancel: () => void }> {
    return window.desktop.llm.debugRunStream(promptId, variables, listeners);
  },
};
