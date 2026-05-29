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

export const submitFeedbackApi = async (body: Record<string, unknown>) => {
  const res = await fetch('/api/quote/chat-feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP_${res.status}`);
  }
};
