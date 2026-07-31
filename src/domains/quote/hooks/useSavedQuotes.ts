'use client';

import { useCallback, useState } from 'react';

import type { CaseBoardResult } from '@/domains/dispatch/services/caseBoard';
import {
  fetchSavedQuoteApi,
  fetchSavedQuotesApi,
  saveQuoteApi,
} from '@/domains/quote/services/savedQuoteApi';
import type {
  SavedQuoteDetail,
  SavedQuoteSummary,
} from '@/domains/quote/types/savedQuote';

export function useSavedQuotes() {
  const [summaries, setSummaries] = useState<SavedQuoteSummary[]>([]);
  const [selected, setSelected] = useState<SavedQuoteDetail | null>(null);
  const [isListLoading, setIsListLoading] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsListLoading(true);
    const result = await fetchSavedQuotesApi().catch(() => ({
      ok: false as const,
      reason: 'request-failed' as const,
      message: '견적 기록을 불러오지 못했습니다.',
    }));
    setIsListLoading(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setSummaries(result.data);
    setMessage(null);
  }, []);

  const save = useCallback(async (quoteBook: CaseBoardResult) => {
    setIsSaving(true);
    setMessage(null);
    const result = await saveQuoteApi(quoteBook).catch(() => ({
      ok: false as const,
      reason: 'request-failed' as const,
      message: '견적 기록을 저장하지 못했습니다.',
    }));
    setIsSaving(false);
    if (!result.ok) {
      setMessage(result.message);
      return false;
    }
    const { quoteBook: _quoteBook, ...summary } = result.data;
    setSummaries((current) => [summary, ...current.filter((item) => item.id !== summary.id)]);
    setMessage('견적 기록에 저장했습니다.');
    return true;
  }, []);

  const open = useCallback(async (id: string) => {
    setIsDetailLoading(true);
    setMessage(null);
    const result = await fetchSavedQuoteApi(id).catch(() => ({
      ok: false as const,
      reason: 'request-failed' as const,
      message: '견적 기록을 열지 못했습니다.',
    }));
    setIsDetailLoading(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setSelected(result.data);
  }, []);

  const close = useCallback(() => setSelected(null), []);

  return {
    summaries,
    selected,
    isListLoading,
    isDetailLoading,
    isSaving,
    message,
    refresh,
    save,
    open,
    close,
  };
}
