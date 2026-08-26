import { useCallback, useRef, useState } from 'react';
import type { ReviewAiDraftInput, ReviewAiDraftResult } from '../../shared/api.types';
import { aiClient } from '../lib/ai/ai-client';
import { getLlmErrorMessage, isLlmBudgetExceeded, isLlmNotConfigured } from '../lib/ai/llm-errors';

interface UseReviewAiDraftResult {
  loading: boolean;
  streamingText: string;
  error: string | null;
  notConfigured: boolean;
  budgetExceeded: boolean;
  generateDraft: (input: ReviewAiDraftInput) => Promise<ReviewAiDraftResult | null>;
  generateDraftStream: (input: ReviewAiDraftInput) => Promise<ReviewAiDraftResult | null>;
  resetError: () => void;
  cancelStream: () => void;
}

export function useReviewAiDraft(): UseReviewAiDraftResult {
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [budgetExceeded, setBudgetExceeded] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);

  const handleError = useCallback((reason: unknown): null => {
    if (isLlmNotConfigured(reason)) {
      setNotConfigured(true);
      setError('请先在设置中配置 OpenRouter API Key');
    } else if (isLlmBudgetExceeded(reason)) {
      setBudgetExceeded(true);
      setError('本月 token 预算已用尽，可在设置中调整');
    } else {
      setError(getLlmErrorMessage(reason));
    }
    return null;
  }, []);

  const generateDraft = useCallback(
    async (input: ReviewAiDraftInput): Promise<ReviewAiDraftResult | null> => {
      setLoading(true);
      setStreamingText('');
      setError(null);
      setNotConfigured(false);
      setBudgetExceeded(false);
      try {
        return await aiClient.generateReviewDraft(input);
      } catch (reason) {
        return handleError(reason);
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const cancelStream = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
    setLoading(false);
  }, []);

  const generateDraftStream = useCallback(
    async (input: ReviewAiDraftInput): Promise<ReviewAiDraftResult | null> => {
      setLoading(true);
      setStreamingText('');
      setError(null);
      setNotConfigured(false);
      setBudgetExceeded(false);

      return new Promise((resolve) => {
        void aiClient
          .generateReviewDraftStream(input, {
            onChunk: (delta) => setStreamingText((current) => current + delta),
            onDone: (result) => {
              cancelRef.current = null;
              setLoading(false);
              resolve(result);
            },
            onError: (streamError) => {
              cancelRef.current = null;
              setLoading(false);
              resolve(handleError(new Error(`${streamError.code}: ${streamError.message}`)));
            },
          })
          .then((session) => {
            cancelRef.current = session.cancel;
          })
          .catch((reason: unknown) => {
            cancelRef.current = null;
            setLoading(false);
            resolve(handleError(reason));
          });
      });
    },
    [handleError],
  );

  const resetError = useCallback(() => {
    setError(null);
    setNotConfigured(false);
    setBudgetExceeded(false);
    setStreamingText('');
  }, []);

  return {
    loading,
    streamingText,
    error,
    notConfigured,
    budgetExceeded,
    generateDraft,
    generateDraftStream,
    resetError,
    cancelStream,
  };
}
