'use client';

import { useState } from 'react';
import {
  fetchSessionsApi,
  createSessionApi,
  loadSessionMessagesApi,
  persistMessageApi,
  fetchAttachmentsApi,
  fetchGeneratedFilesApi,
  deleteSessionApi,
} from '@/domains/chat/services/chatSessionApi';
import { createMessageId, WELCOME_MESSAGE } from '@/domains/chat/utils';
import type {
  ChatMessage,
  AIQuoteResponse,
  ChatSession,
  ChatAttachment,
  GeneratedFile,
  ChatStructuredPayload,
} from '@/domains/chat/types';

interface UseChatSessionsDeps {
  /** 메시지 목록 setter(모달 소유). 세션 로드/생성 시 갱신한다. */
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  /** 직전 견적 결과 초기화(세션 전환 시). */
  setLatestResult: (value: AIQuoteResponse | null) => void;
  /** 경로 미리보기 에러 초기화(세션 전환 시). */
  setPreviewError: (value: string | null) => void;
  /** 시스템/안내 말풍선 추가(삭제 실패 등 알림용). */
  pushAssistantMessage: (content: string, kind?: ChatMessage['kind']) => void;
}

/**
 * AI 견적 챗의 세션·첨부·생성파일 상태와 Supabase 영속 로직을 캡슐화한다.
 *
 * 메시지/결과/미리보기 상태는 모달이 소유하므로 setter를 주입받는다.
 * 반환 식별자는 모달의 기존 호출부와 동일한 이름으로 구조분해되도록 설계해
 * send/upload/generate 등 핵심 플로우의 호출부를 변경 없이 유지한다.
 */
export function useChatSessions({
  setMessages,
  setLatestResult,
  setPreviewError,
  pushAssistantMessage,
}: UseChatSessionsDeps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(false);
  const [sessionPersistenceEnabled, setSessionPersistenceEnabled] = useState(true);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFile[]>([]);

  const fetchSessions = async () => {
    try {
      const { ok, sessions: list } = await fetchSessionsApi();
      setSessionPersistenceEnabled(ok);
      if (!ok) return [] as ChatSession[];
      setSessions(list);
      return list;
    } catch {
      setSessionPersistenceEnabled(false);
      return [] as ChatSession[];
    }
  };

  const createNewSession = async (title?: string) => {
    const created = await createSessionApi(title || `견적 대화 ${new Date().toLocaleDateString('ko-KR')}`);
    if (created) {
      setSessionPersistenceEnabled(true);
      await fetchSessions();
      setCurrentSessionId(created.id);
      return created;
    }
    const localId = `local-${Date.now()}`;
    const localSession: ChatSession = {
      id: localId,
      title: title || `로컬 대화 ${new Date().toLocaleDateString('ko-KR')}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_summary: null,
    };
    setSessionPersistenceEnabled(false);
    setSessions((prev) => [localSession, ...prev.filter((s) => !s.id.startsWith('local-'))]);
    setCurrentSessionId(localId);
    return localSession;
  };

  const loadSessionMessages = async (sessionId: string) => {
    if (sessionId.startsWith('local-')) return;
    setIsSessionLoading(true);
    try {
      const persisted = await loadSessionMessagesApi(sessionId);
      if (!persisted) return;
      if (persisted.length === 0) {
        setMessages([
          {
            id: createMessageId(),
            role: 'assistant',
            kind: 'system',
            content: WELCOME_MESSAGE,
            timestamp: new Date(),
          },
        ]);
        return;
      }
      setMessages(
        persisted.map((m) => ({
          ...(typeof m.metadata === 'object' && m.metadata ? { sourceUserText: String((m.metadata as Record<string, unknown>).sourceUserText || '') || undefined } : {}),
          id: m.id || createMessageId(),
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content,
          kind: m.role === 'system' ? 'system' : 'normal',
          timestamp: new Date(m.created_at),
          evidence:
            typeof m.metadata === 'object' && m.metadata
              ? ((m.metadata as Record<string, unknown>).evidence as AIQuoteResponse['evidence']) || undefined
              : undefined,
          // 영속된 구조화 결과(시나리오/출발매트릭스/경로) 복원 → 카드 재표시.
          structured:
            typeof m.metadata === 'object' && m.metadata
              ? ((m.metadata as Record<string, unknown>).structured as ChatStructuredPayload) || undefined
              : undefined,
        }))
      );
    } finally {
      setIsSessionLoading(false);
    }
  };

  const persistMessage = async (
    sessionId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata?: Record<string, unknown>
  ) => {
    if (!sessionPersistenceEnabled || sessionId.startsWith('local-')) return;
    await persistMessageApi(sessionId, role, content, metadata);
  };

  const fetchAttachments = async (sessionId: string) => {
    if (sessionId.startsWith('local-')) {
      setAttachments([]);
      return;
    }
    const list = await fetchAttachmentsApi(sessionId);
    if (list) setAttachments(list);
  };

  const fetchGeneratedFiles = async (sessionId: string) => {
    if (sessionId.startsWith('local-')) {
      setGeneratedFiles([]);
      return;
    }
    const list = await fetchGeneratedFilesApi(sessionId);
    if (list) setGeneratedFiles(list);
  };

  const bootstrapServerSession = async () => {
    const list = await fetchSessions();
    if (list.length > 0) {
      const targetId = list[0].id;
      setCurrentSessionId(targetId);
      await loadSessionMessages(targetId);
      await fetchAttachments(targetId);
      await fetchGeneratedFiles(targetId);
      return;
    }

    const created = await createNewSession();
    if (!created) return;
    setMessages([
      {
        id: createMessageId(),
        role: 'assistant',
        kind: 'system',
        content: WELCOME_MESSAGE,
        timestamp: new Date(),
      },
    ]);
    await persistMessage(created.id, 'system', WELCOME_MESSAGE);
    await fetchAttachments(created.id);
    await fetchGeneratedFiles(created.id);
  };

  const handleSelectSession = async (sessionId: string) => {
    if (sessionId === currentSessionId) return;
    setCurrentSessionId(sessionId);
    setLatestResult(null);
    setPreviewError(null);
    await loadSessionMessages(sessionId);
    await fetchAttachments(sessionId);
    await fetchGeneratedFiles(sessionId);
  };

  const handleDeleteSession = async (sessionId: string) => {
    const target = sessions.find((s) => s.id === sessionId);
    const label = target?.title || '이 대화방';
    if (!confirm(`'${label}' 대화방을 삭제할까요? 첨부/생성 파일 및 메시지가 함께 삭제됩니다.`)) {
      return;
    }

    if (sessionId.startsWith('local-')) {
      const nextSessions = sessions.filter((s) => s.id !== sessionId);
      setSessions(nextSessions);
      if (currentSessionId === sessionId) {
        if (nextSessions[0]) {
          await handleSelectSession(nextSessions[0].id);
        } else {
          const created = await createNewSession();
          if (created) {
            setMessages([
              {
                id: createMessageId(),
                role: 'assistant',
                kind: 'system',
                content: WELCOME_MESSAGE,
                timestamp: new Date(),
              },
            ]);
          }
        }
      }
      return;
    }

    const deleted = await deleteSessionApi(sessionId);
    if (!deleted.success) {
      pushAssistantMessage(`대화방 삭제 실패: ${deleted.message || '알 수 없는 오류'}`, 'system');
      return;
    }

    const list = await fetchSessions();
    if (currentSessionId === sessionId) {
      if (list.length > 0) {
        await handleSelectSession(list[0].id);
      } else {
        const created = await createNewSession();
        if (created) {
          setMessages([
            {
              id: createMessageId(),
              role: 'assistant',
              kind: 'system',
              content: WELCOME_MESSAGE,
              timestamp: new Date(),
            },
          ]);
          await persistMessage(created.id, 'system', WELCOME_MESSAGE);
        }
      }
    } else {
      setSessions(list);
    }
  };

  // 사이드바 "새 대화" — 세션 생성 후 결과/첨부/메시지를 초기화한다.
  const startNewSessionFromSidebar = async () => {
    const created = await createNewSession();
    if (!created) return;
    setLatestResult(null);
    setAttachments([]);
    setGeneratedFiles([]);
    setMessages([
      { id: createMessageId(), role: 'assistant', kind: 'system', content: WELCOME_MESSAGE, timestamp: new Date() },
    ]);
    await persistMessage(created.id, 'system', WELCOME_MESSAGE);
    await fetchAttachments(created.id);
    await fetchGeneratedFiles(created.id);
  };

  return {
    sessions,
    setSessions,
    currentSessionId,
    setCurrentSessionId,
    isSessionLoading,
    sessionPersistenceEnabled,
    setSessionPersistenceEnabled,
    attachments,
    setAttachments,
    generatedFiles,
    setGeneratedFiles,
    fetchSessions,
    createNewSession,
    loadSessionMessages,
    persistMessage,
    fetchAttachments,
    fetchGeneratedFiles,
    bootstrapServerSession,
    handleSelectSession,
    handleDeleteSession,
    startNewSessionFromSidebar,
  };
}
