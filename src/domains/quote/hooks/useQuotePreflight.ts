'use client';

import { useCallback, useState } from 'react';
import { fetchQuotePreflight } from '@/domains/quote/services/quotePreflightApi';
import type { QuotePreflightDraft } from '@/domains/quote/types/quotePreflight';

export function useQuotePreflight() {
  const [sourceText, setSourceText] = useState<string | null>(null);
  const [draft, setDraft] = useState<QuotePreflightDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prepare = useCallback(async (message: string) => {
    setSourceText(message);
    setDraft(null);
    setError(null);
    setLoading(true);
    try {
      setDraft(await fetchQuotePreflight(message));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : '요청 내용을 구조화하지 못했습니다.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setSourceText(null);
    setDraft(null);
    setError(null);
    setLoading(false);
  }, []);

  return {
    sourceText,
    draft,
    setDraft,
    loading,
    error,
    prepare,
    clear,
  };
}
