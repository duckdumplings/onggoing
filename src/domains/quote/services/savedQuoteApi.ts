import type { CaseBoardResult } from '@/domains/dispatch/services/caseBoard';
import { getAuthHeaders } from '@/domains/chat/services/chatSessionApi';
import type {
  SavedQuoteDetail,
  SavedQuoteSummary,
} from '@/domains/quote/types/savedQuote';

export type SavedQuoteApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'auth-required' | 'request-failed'; message: string };

async function parseError(response: Response, fallback: string): Promise<string> {
  const json = await response.json().catch(() => null);
  return json?.error?.message || fallback;
}

export async function fetchSavedQuotesApi(): Promise<SavedQuoteApiResult<SavedQuoteSummary[]>> {
  const headers = await getAuthHeaders();
  if (!headers) {
    return { ok: false, reason: 'auth-required', message: '로그인된 팀 계정에서 견적 기록을 사용할 수 있어요.' };
  }

  const response = await fetch('/api/quote/saved-quotes?limit=50', { headers });
  if (!response.ok) {
    return {
      ok: false,
      reason: response.status === 401 ? 'auth-required' : 'request-failed',
      message: await parseError(response, '견적 기록을 불러오지 못했습니다.'),
    };
  }
  const json = await response.json();
  return { ok: true, data: (json.data ?? []) as SavedQuoteSummary[] };
}

export async function fetchSavedQuoteApi(id: string): Promise<SavedQuoteApiResult<SavedQuoteDetail>> {
  const headers = await getAuthHeaders();
  if (!headers) {
    return { ok: false, reason: 'auth-required', message: '로그인된 팀 계정에서 견적 기록을 사용할 수 있어요.' };
  }

  const response = await fetch(`/api/quote/saved-quotes?id=${encodeURIComponent(id)}`, { headers });
  if (!response.ok) {
    return {
      ok: false,
      reason: response.status === 401 ? 'auth-required' : 'request-failed',
      message: await parseError(response, '견적 기록을 열지 못했습니다.'),
    };
  }
  const json = await response.json();
  return { ok: true, data: json.data as SavedQuoteDetail };
}

export async function saveQuoteApi(quoteBook: CaseBoardResult): Promise<SavedQuoteApiResult<SavedQuoteDetail>> {
  const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
  if (!headers) {
    return { ok: false, reason: 'auth-required', message: '로그인된 팀 계정에서 견적 기록을 사용할 수 있어요.' };
  }

  const response = await fetch('/api/quote/saved-quotes', {
    method: 'POST',
    headers,
    body: JSON.stringify({ quoteBook }),
  });
  if (!response.ok) {
    return {
      ok: false,
      reason: response.status === 401 ? 'auth-required' : 'request-failed',
      message: await parseError(response, '견적 기록을 저장하지 못했습니다.'),
    };
  }
  const json = await response.json();
  return { ok: true, data: json.data as SavedQuoteDetail };
}
