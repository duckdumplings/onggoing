import { supabase } from '@/libs/supabase-client';
import type {
  ChatSession,
  PersistedChatMessage,
  ChatAttachment,
  GeneratedFile,
} from '../types';

/** 현재 Supabase 세션 토큰을 Authorization 헤더로 구성한다. 없으면 undefined. */
export const getAuthHeaders = async (base?: HeadersInit): Promise<HeadersInit | undefined> => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return undefined;
  const headers = new Headers(base || {});
  headers.set('Authorization', `Bearer ${token}`);
  return Object.fromEntries(headers.entries());
};

export const fetchSessionsApi = async (): Promise<{ ok: boolean; sessions: ChatSession[] }> => {
  const headers = await getAuthHeaders();
  if (!headers) return { ok: false, sessions: [] };
  const res = await fetch('/api/quote/chat-sessions?limit=50', { headers });
  if (!res.ok) return { ok: false, sessions: [] };
  const json = await res.json();
  if (!json?.success) return { ok: true, sessions: [] };
  return { ok: true, sessions: (json.data || []) as ChatSession[] };
};

export const createSessionApi = async (title: string): Promise<ChatSession | null> => {
  const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
  if (!headers) return null;
  const res = await fetch('/api/quote/chat-sessions', {
    method: 'POST',
    headers,
    body: JSON.stringify({ title }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  if (!json?.success) return null;
  return json.data as ChatSession;
};

export const loadSessionMessagesApi = async (sessionId: string): Promise<PersistedChatMessage[] | null> => {
  const res = await fetch(`/api/quote/chat-sessions/${sessionId}/messages`, {
    headers: (await getAuthHeaders()) ?? undefined,
  });
  const json = await res.json();
  if (!json?.success) return null;
  return (json.data || []) as PersistedChatMessage[];
};

export const persistMessageApi = async (
  sessionId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  metadata?: Record<string, unknown>
) => {
  const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
  await fetch(`/api/quote/chat-sessions/${sessionId}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ role, content, metadata: metadata || {} }),
  });
};

export const fetchAttachmentsApi = async (sessionId: string): Promise<ChatAttachment[] | null> => {
  const res = await fetch(`/api/quote/chat-sessions/${sessionId}/attachments`, {
    headers: (await getAuthHeaders()) ?? undefined,
  });
  const json = await res.json();
  if (!json?.success) return null;
  return (json.data || []) as ChatAttachment[];
};

export const fetchGeneratedFilesApi = async (sessionId: string): Promise<GeneratedFile[] | null> => {
  const res = await fetch(`/api/quote/chat-sessions/${sessionId}/generated-files`, {
    headers: (await getAuthHeaders()) ?? undefined,
  });
  const json = await res.json();
  if (!json?.success) return null;
  return (json.data || []) as GeneratedFile[];
};

export const uploadAttachmentApi = async (
  sessionId: string,
  file: File
): Promise<{ success: boolean; message?: string }> => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`/api/quote/chat-sessions/${sessionId}/attachments`, {
    method: 'POST',
    headers: (await getAuthHeaders()) ?? undefined,
    body: formData,
  });
  const json = await res.json();
  if (!json?.success) return { success: false, message: json?.error?.message };
  return { success: true };
};

export const generateFileApi = async (
  sessionId: string,
  fileType: GeneratedFile['file_type'],
  input: Record<string, unknown>
): Promise<{ success: boolean; message?: string }> => {
  const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
  const res = await fetch(`/api/quote/chat-sessions/${sessionId}/generated-files`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ fileType, input }),
  });
  const json = await res.json();
  if (!json?.success) return { success: false, message: json?.error?.message };
  return { success: true };
};

export const deleteSessionApi = async (sessionId: string): Promise<{ success: boolean; message?: string }> => {
  const res = await fetch(`/api/quote/chat-sessions/${sessionId}`, {
    method: 'DELETE',
    headers: (await getAuthHeaders()) ?? undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.success) return { success: false, message: json?.error?.message };
  return { success: true };
};

/**
 * 피드백을 내구성 있게 전송한다(익명·로그인 불필요). 예외를 던지지 않고 성공 여부를 boolean으로 반환.
 * 1) keepalive fetch(페이지 이탈에도 유지) → 2) 지수 백오프 재시도(총 3회) →
 * 3) 최종 폴백으로 navigator.sendBeacon(text/plain). 모두 실패하면 false.
 */
export const submitFeedbackApi = async (body: Record<string, unknown>): Promise<boolean> => {
  const payload = JSON.stringify(body);
  const MAX_ATTEMPTS = 3;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch('/api/quote/chat-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      });
      if (res.ok) return true;
    } catch {
      // 네트워크 오류 — 아래 백오프 후 재시도한다.
    }
    // 마지막 시도 뒤에는 대기하지 않는다.
    if (attempt < MAX_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
    }
  }
  // 최종 폴백: sendBeacon(text/plain). 언로드 중에도 전송 큐에 실린다.
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([payload], { type: 'text/plain' });
      if (navigator.sendBeacon('/api/quote/chat-feedback', blob)) return true;
    }
  } catch {
    // sendBeacon 사용 불가 — 실패로 처리한다.
  }
  return false;
};
