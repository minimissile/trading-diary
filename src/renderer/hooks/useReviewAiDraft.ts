import { useCallback, useState } from 'react';
import type { ReviewAiDraftInput, ReviewAiDraftResult } from '../../shared/api.types';
import { aiClient } from '../lib/ai/ai-client';
import { getLlmErrorMessage, isLlmNotConfigured } from '../lib/ai/llm-errors';

interface UseReviewAiDraftResult {
  loading: boolean;
  error: string | null;
  notConfigured: boolean;
  generateDraft: (input: ReviewAiDraftInput) => Promise<ReviewAiDraftResult | null>;
  resetError: () => void;
}

export function useReviewAiDraft(): UseReviewAiDraftResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  const generateDraft = useCallback(async (input: ReviewAiDraftInput): Promise<ReviewAiDraftResult | null> => {
    setLoading(true);
    setError(null);
    setNotConfigured(false);
    try {
      return await aiClient.generateReviewDraft(input);
    } catch (reason) {
      if (isLlmNotConfigured(reason)) {
        setNotConfigured(true);
        setError('请先在设置中配置 OpenRouter API Key');
      } else {
        setError(getLlmErrorMessage(reason));
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const resetError = useCallback(() => {
    setError(null);
    setNotConfigured(false);
  }, []);

  return { loading, error, notConfigured, generateDraft, resetError };
}
