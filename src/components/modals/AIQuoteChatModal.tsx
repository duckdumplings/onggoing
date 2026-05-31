'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouteOptimization } from '@/hooks/useRouteOptimization';
import { X, MapPin, Truck, Clock, Calculator, ArrowRight, Loader2, Sparkles, Map as MapIcon, RefreshCw, Paperclip, Download, FileText, Trash2, Check, Square, ThumbsUp, ThumbsDown } from 'lucide-react';
import { supabase } from '@/libs/supabase-client';
import ScenarioComparisonCard from '@/domains/dispatch/components/ScenarioComparisonCard';
import DepartureMatrixCard from '@/domains/dispatch/components/DepartureMatrixCard';
import SingleQuoteInsights from '@/domains/dispatch/components/SingleQuoteInsights';
import ChatMarkdown from '@/domains/chat/components/ChatMarkdown';
import QuoteDetailModal from '@/domains/chat/components/QuoteDetailModal';
import {
  createMessageId,
  shouldRenderEvidence,
  getDomainFromUrl,
  sanitizeRequestDataForPreview,
  WELCOME_MESSAGE,
} from '@/domains/chat/utils';
import {
  fetchSessionsApi,
  createSessionApi,
  loadSessionMessagesApi,
  persistMessageApi,
  fetchAttachmentsApi,
  fetchGeneratedFilesApi,
  uploadAttachmentApi,
  generateFileApi,
  deleteSessionApi,
  submitFeedbackApi,
} from '@/domains/chat/services/chatSessionApi';
import type {
  ChatMessage,
  AIQuoteResponse,
  ChatSession,
  ChatAttachment,
  GeneratedFile,
  AgentStep,
  ChatStructuredPayload,
} from '@/domains/chat/types';

/** 최종 페이로드에서 구조화 카드용 데이터를 추린다(없으면 undefined). */
function buildStructuredFromPayload(payload: AIQuoteResponse): ChatStructuredPayload | undefined {
  const hasAny =
    Boolean(payload.scenarioComparison) ||
    Boolean(payload.departureMatrix) ||
    Boolean(payload.routeRequest) ||
    Boolean(payload.quote);
  if (!hasAny) return undefined;
  return {
    quote: payload.quote ?? undefined,
    scenarioComparison: payload.scenarioComparison ?? undefined,
    scenarioRoutes: payload.scenarioRoutes ?? undefined,
    scenarioRouteErrors: payload.scenarioRouteErrors ?? undefined,
    routeRequest: payload.routeRequest ?? undefined,
    departureMatrix: payload.departureMatrix ?? undefined,
    departureAt: payload.departureAt ?? undefined,
    realtimeTraffic: true,
  };
}

interface AIQuoteChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AIQuoteChatModal({ isOpen, onClose }: AIQuoteChatModalProps) {
  const { optimizeRouteWith, requestInputApply, setMultiDriverResult } = useRouteOptimization();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: `msg-${Date.now()}-welcome`,
      role: 'assistant',
      kind: 'system',
      content: WELCOME_MESSAGE,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [latestResult, setLatestResult] = useState<AIQuoteResponse | null>(null);
  const [isQuoteDetailOpen, setIsQuoteDetailOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(false);
  const [sessionPersistenceEnabled, setSessionPersistenceEnabled] = useState(true);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingFile, setIsGeneratingFile] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'input-order' | 'optimized-order'>('input-order');
  const [expandedEvidenceByMessageId, setExpandedEvidenceByMessageId] = useState<Record<string, boolean>>({});
  const [feedbackSentByMessageId, setFeedbackSentByMessageId] = useState<Record<string, 'positive' | 'negative' | undefined>>({});
  const [authEmail, setAuthEmail] = useState('info@naeyil.com');
  const [authPassword, setAuthPassword] = useState('');
  const [authUserEmail, setAuthUserEmail] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showAuthForm, setShowAuthForm] = useState(false);

  // 직전 결과(견적/시나리오/경로 좌표)를 후속 요청 컨텍스트로 구조화 — 멀티턴 메모리.
  const conversationContext = useMemo(() => {
    if (!latestResult) return undefined;
    const ctx: Record<string, any> = {};
    const basis = latestResult.quote?.basis;
    if (basis?.vehicleType) ctx.vehicleType = basis.vehicleType;
    if (basis?.scheduleType) ctx.scheduleType = basis.scheduleType;

    const results = latestResult.scenarioComparison?.results;
    if (results?.length) {
      ctx.scenarios = results.map((r: any) => ({
        label: r.label,
        stops: r.counts?.totalStops,
        vehicleType: r.vehicleType,
      }));
    }

    const addrs = new Set<string>();
    const collect = (rr: any) => {
      if (!rr) return;
      [...(rr.origins || []), ...(rr.destinations || [])].forEach((p: any) => {
        const a = typeof p === 'string' ? p : p?.address;
        if (a) addrs.add(String(a));
      });
      if (rr.finalDestinationAddress) addrs.add(String(rr.finalDestinationAddress));
    };
    collect(latestResult.routeRequest);
    (latestResult.scenarioRoutes || []).forEach((s: any) => collect(s.routeRequest));
    if (addrs.size) ctx.knownAddresses = Array.from(addrs).slice(0, 30);

    // 구 파이프라인 호환(있으면 사용)
    if (!ctx.vehicleType && latestResult.extracted?.vehicleType) ctx.vehicleType = latestResult.extracted.vehicleType;
    if (!ctx.scheduleType && latestResult.extracted?.scheduleType) ctx.scheduleType = latestResult.extracted.scheduleType;

    return Object.keys(ctx).length ? ctx : undefined;
  }, [latestResult]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => scrollToBottom(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const autoResize = () => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
  };

  const pushAssistantMessage = (
    content: string,
    kind: ChatMessage['kind'] = 'normal',
    options?: { evidence?: AIQuoteResponse['evidence']; sourceUserText?: string; structured?: ChatStructuredPayload }
  ) => {
    setMessages((prev) => [
      ...prev,
      {
        id: createMessageId(),
        role: 'assistant',
        content,
        kind,
        timestamp: new Date(),
        evidence: options?.evidence,
        sourceUserText: options?.sourceUserText,
        structured: options?.structured,
      },
    ]);
  };

  const renderMessageBody = (msg: ChatMessage) => {
    if (msg.role === 'user') {
      return <div className="whitespace-pre-wrap break-words">{msg.content}</div>;
    }
    return <ChatMarkdown content={msg.content} />;
  };

  const quickTemplates = useMemo(() => {
    const recentUsers = messages
      .filter((m) => m.role === 'user')
      .slice(-4)
      .map((m) => m.content.trim())
      .filter(Boolean);
    const fromSuggestions = latestResult?.suggestedPrompts?.slice(0, 3) || [];
    const merged = [...fromSuggestions, ...recentUsers].filter(Boolean);
    const unique = Array.from(new Set(merged));
    if (unique.length > 0) return unique.slice(0, 4);
    return [
      '강남역에서 판교역으로 레이 퀵 보낼래',
      '3개·5개·10개 구청 수거 후 문래역 하차, 스타렉스로 시나리오 비교해줘',
      '분기 1회(연 4회) 정기 수거로 연간 비용까지 계산해줘',
      '견적 의뢰 메일 붙여넣을게, 그대로 견적내줘',
    ];
  }, [latestResult?.suggestedPrompts, messages]);

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
    await persistMessage(
      created.id,
      'system',
      WELCOME_MESSAGE
    );
    await fetchAttachments(created.id);
    await fetchGeneratedFiles(created.id);
  };

  const handleSignIn = async () => {
    const email = authEmail.trim();
    const password = authPassword.trim();
    if (!email || !password) {
      setAuthError('이메일과 비밀번호를 입력해 주세요.');
      return;
    }

    setIsAuthLoading(true);
    setAuthError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error || !data.session?.access_token) {
        throw new Error(error?.message || '로그인에 실패했습니다.');
      }
      setAuthUserEmail(data.user?.email || email);
      setSessionPersistenceEnabled(true);
      setShowAuthForm(false);
      setAuthPassword('');
      if (isOpen) {
        await bootstrapServerSession();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '로그인이 처리되지 않았어요. 잠시 후 다시 시도해 주세요.';
      setAuthError(message);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setAuthUserEmail(null);
      setSessionPersistenceEnabled(false);
      setSessions([]);
      setCurrentSessionId(`local-${Date.now()}`);
      setAttachments([]);
      setGeneratedFiles([]);
      setShowAuthForm(false);
      pushAssistantMessage('로그아웃되었습니다. 현재는 로컬 임시 대화 모드입니다.', 'system');
    } catch (error) {
      const message = error instanceof Error ? error.message : '로그아웃이 처리되지 않았어요. 잠시 후 다시 시도해 주세요.';
      setAuthError(message);
    } finally {
      setIsAuthLoading(false);
    }
  };

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

  const handleUploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    let sessionId = currentSessionId;
    if (!sessionId) {
      const created = await createNewSession();
      sessionId = created?.id || null;
    }
    if (!sessionId || sessionId.startsWith('local-')) {
      pushAssistantMessage('로컬 임시 대화에서는 파일 업로드를 사용할 수 없습니다. 서버 세션을 다시 시도해주세요.', 'system');
      return;
    }

    setIsUploading(true);
    try {
      const list = Array.from(files).slice(0, 5);
      for (const file of list) {
        const result = await uploadAttachmentApi(sessionId, file);
        if (!result.success) {
          pushAssistantMessage(`파일 업로드 실패: ${file.name} (${result.message || '알 수 없는 오류'})`, 'system');
          continue;
        }
      }
      await fetchAttachments(sessionId);
      pushAssistantMessage('첨부 파일 분석이 반영되었습니다. 이제 파일 내용을 기준으로 질문하셔도 됩니다.', 'system');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleGenerateFile = async (fileType: GeneratedFile['file_type']) => {
    if (!currentSessionId || currentSessionId.startsWith('local-')) return;
    setIsGeneratingFile(true);
    try {
      const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content;
      const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')?.content;
      const comparison = latestResult?.scenarioComparison;
      const scenarios = comparison?.results?.map((r: any) => ({
        label: r.label,
        recommendedPlan: r.recommendedPlan,
        oneTimePrice: r.oneTimePrice,
        annualPrice: r.annualPrice,
        hourlyTotal: r.plans?.hourly?.total,
        perJobTotal: r.plans?.perJob?.total,
        km: r.metrics?.km,
        totalMinutes:
          r.metrics != null ? Number(r.metrics.driveMinutes || 0) + Number(r.metrics.dwellMinutes || 0) : undefined,
      }));
      const firstResult = comparison?.results?.[0];
      const result = await generateFileApi(currentSessionId, fileType, {
        sessionTitle: sessions.find((s) => s.id === currentSessionId)?.title,
        userRequest: lastUser,
        assistantMessage: lastAssistant,
        quote: latestResult?.quote,
        routeSummary: latestResult?.routeSummary,
        extracted: latestResult?.extracted,
        assumptions: latestResult?.assumptions || [],
        ragSources: latestResult?.rag?.sources || [],
        vehicleType: firstResult?.vehicleType,
        scheduleType: firstResult?.scheduleType,
        frequencyLabel: firstResult?.frequencyLabel ?? comparison?.results?.[0]?.frequencyLabel,
        scenarios,
        recommendedScenarioLabel: comparison?.recommendedLabel ?? null,
      });
      if (!result.success) {
        pushAssistantMessage(`파일 생성 실패: ${result.message || '알 수 없는 오류'}`, 'system');
        return;
      }
      await fetchGeneratedFiles(currentSessionId);
      pushAssistantMessage(`요청하신 ${fileType.toUpperCase()} 파일을 생성했습니다. 우측 패널에서 다운로드할 수 있어요.`, 'system');
    } finally {
      setIsGeneratingFile(false);
    }
  };

  const handleReset = () => {
    if (confirm('새로운 대화를 시작하시겠습니까? 기존 대화 내용은 사라집니다.')) {
      (async () => {
        const created = await createNewSession();
        if (created) {
          setLatestResult(null);
          setPreviewError(null);
          setInput('');
          setAttachments([]);
          setGeneratedFiles([]);
          setMessages([
            {
              id: createMessageId(),
              role: 'assistant',
              kind: 'system',
      content: WELCOME_MESSAGE,
      timestamp: new Date(),
            },
          ]);
          await persistMessage(
            created.id,
            'system',
            WELCOME_MESSAGE
          );
          await fetchAttachments(created.id);
          await fetchGeneratedFiles(created.id);
        }
      })();
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      const list = await fetchSessions();
      if (list.length > 0) {
        const targetId = currentSessionId || list[0].id;
        setCurrentSessionId(targetId);
        await loadSessionMessages(targetId);
        await fetchAttachments(targetId);
        await fetchGeneratedFiles(targetId);
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
          await persistMessage(
            created.id,
            'system',
            WELCOME_MESSAGE
          );
          await fetchAttachments(created.id);
          await fetchGeneratedFiles(created.id);
        }
      }
    })();
  }, [isOpen]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!isMounted) return;
      const session = data.session;
      setAuthUserEmail(session?.user?.email || null);
      setSessionPersistenceEnabled(Boolean(session?.access_token));
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      setAuthUserEmail(session?.user?.email || null);
      setSessionPersistenceEnabled(Boolean(session?.access_token));
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSend = async (overrideMessage?: string, opts?: { skipUserEcho?: boolean }) => {
    const message = (typeof overrideMessage === 'string' ? overrideMessage : input).trim();
    if (!message || loading) return;

    if (!opts?.skipUserEcho) {
      setMessages((prev) => [...prev, { id: createMessageId(), role: 'user', content: message, timestamp: new Date() }]);
      setInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = '56px'; // 초기 높이로 리셋
      }
    }
    setLoading(true);

    try {
      let sessionId = currentSessionId;
      if (!sessionId) {
        const created = await createNewSession();
        sessionId = created?.id || null;
      }
      if (sessionId) {
        await persistMessage(sessionId, 'user', message);
      }

      // Send recent history (excluding the very latest user message which is sent as 'message')
      // The state update for 'messages' happens BEFORE this async call completes, 
      // but inside handleSend, 'messages' variable from state might not be updated yet due to closure?
      // Actually setMessages uses a callback, so 'messages' here refers to the state at render time.
      // We should append the current user message to history? No, the API treats 'message' as the new input.
      // So history should comprise everything BEFORE the current new message.
      // But we just called setMessages... standard React pitfall.
      // We should use the current 'messages' array (before update) as history.

      const history = messages
        .slice(-8)
        .map((m) => ({
          role: m.role,
          content: m.content.slice(0, 600),
        }));
      const sessionSummary = sessions.find((s) => s.id === sessionId)?.last_summary || null;

      // 추론 기반 견적 에이전트(tool-calling). SSE 스트리밍으로 토큰/도구 단계를 실시간 수신한다.
      setAgentSteps([]);
      const liveId = createMessageId();
      let liveText = '';
      let liveCreated = false;
      const ensureLiveMessage = () => {
        if (liveCreated) return;
        liveCreated = true;
        setMessages((prev) => [
          ...prev,
          { id: liveId, role: 'assistant', content: '', kind: 'normal', timestamp: new Date() },
        ]);
      };

      const controller = new AbortController();
      abortRef.current = controller;

      const res = await fetch('/api/quote/agent-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          history,
          sessionId,
          sessionSummary,
          attachmentIds: attachments.map((a) => a.id),
          conversationContext,
        }),
        signal: controller.signal,
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !res.body || !contentType.includes('text/event-stream')) {
        const json = (await res.json().catch(() => null)) as AIQuoteResponse | null;
        if (json) setLatestResult(json);
        const errMsg = json?.error?.message || '견적 처리에 실패했어요. 잠시 후 다시 시도해 주세요.';
        pushAssistantMessage(errMsg, 'normal', { sourceUserText: message });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalPayload: AIQuoteResponse | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';
        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line.startsWith('data:')) continue;
          let data: any;
          try {
            data = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }
          if (data.type === 'text') {
            ensureLiveMessage();
            liveText += data.delta || '';
            setMessages((prev) => prev.map((m) => (m.id === liveId ? { ...m, content: liveText } : m)));
          } else if (data.type === 'step') {
            setAgentSteps((prev) => {
              if (data.phase === 'start') {
                if (prev.some((s) => s.name === data.name)) return prev;
                return [...prev, { name: data.name, label: data.label, phase: 'start' }];
              }
              const exists = prev.some((s) => s.name === data.name);
              if (!exists) return [...prev, { name: data.name, label: data.label, phase: data.phase }];
              return prev.map((s) => (s.name === data.name ? { ...s, phase: data.phase } : s));
            });
          } else if (data.type === 'final') {
            finalPayload = data.payload as AIQuoteResponse;
          }
        }
      }

      setAgentSteps([]);

      if (!finalPayload) {
        if (!liveText) {
          pushAssistantMessage('응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.', 'normal', { sourceUserText: message });
        }
        return;
      }

      const payload = finalPayload;
      setLatestResult(payload);

      if (!payload.success) {
        const errText = payload.error?.message || '견적 처리에 실패했어요. 잠시 후 다시 시도해 주세요.';
        if (liveCreated) {
          setMessages((prev) =>
            prev.map((m) => (m.id === liveId ? { ...m, content: liveText || errText, sourceUserText: message } : m))
          );
        } else {
          pushAssistantMessage(liveText || errText, 'normal', { sourceUserText: message });
        }
        return;
      }

      const hasQuote = Boolean(payload.quote);
      const text = (liveText || payload.assistantMessage || '').trim();
      const structured = buildStructuredFromPayload(payload);

      if (liveCreated) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === liveId
              ? { ...m, content: text || '(응답 없음)', kind: hasQuote ? 'result' : 'normal', evidence: payload.evidence, sourceUserText: message, structured }
              : m
          )
        );
      } else if (text) {
        pushAssistantMessage(text, hasQuote ? 'result' : 'normal', { evidence: payload.evidence, sourceUserText: message, structured });
      } else if (payload.followUpQuestions?.length) {
        pushAssistantMessage(payload.followUpQuestions.map((q) => `• ${q.question}`).join('\n'), 'system');
      } else {
        pushAssistantMessage('정보가 조금 더 필요합니다. 출발지와 목적지를 알려주시겠어요?', 'system');
      }

      if (sessionId && text) {
        await persistMessage(sessionId, 'assistant', text, {
          quote: payload.quote || null,
          routeSummary: payload.routeSummary || null,
          evidence: payload.evidence || null,
          sourceUserText: message,
          structured: structured ?? null,
        });
      }

      if (payload.assumptions?.length) {
        pushAssistantMessage(`참고: ${payload.assumptions.join(', ')}`, 'system');
      }

      // 하이브리드: 추천(기본) 시나리오/경로를 모달은 열어둔 채 지도에 자동 반영.
      autoPreviewRecommended(payload);
    } catch (error) {
      if ((error as any)?.name === 'AbortError') {
        pushAssistantMessage('요청을 중단했어요.', 'system');
      } else {
        pushAssistantMessage('서버와 연결이 끊어졌어요. 잠시 후 다시 시도해 주세요.');
      }
    } finally {
      abortRef.current = null;
      setAgentSteps([]);
      setLoading(false);
    }
  };

  const handleStopGeneration = () => {
    abortRef.current?.abort();
    abortRef.current = null;
  };

  // 마지막 사용자 질문으로 답변을 다시 생성(사용자 말풍선 중복 없이).
  const handleRegenerate = () => {
    if (loading) return;
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser?.content) return;
    void handleSend(lastUser.content, { skipUserEcho: true });
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
          await persistMessage(
            created.id,
            'system',
            WELCOME_MESSAGE
          );
        }
      }
    } else {
      setSessions(list);
    }
  };

  const submitFeedback = async (msg: ChatMessage, type: 'positive' | 'negative') => {
    // UX: 버튼 클릭 즉시 시각적 반영(로그인/세션 유무와 무관)
    setFeedbackSentByMessageId((prev) => ({ ...prev, [msg.id]: type }));
    try {
      await submitFeedbackApi({
        sessionId: currentSessionId && !currentSessionId.startsWith('local-') ? currentSessionId : null,
        userInput: msg.sourceUserText || 'unknown',
        assistantOutput: msg.content,
        feedbackType: type,
        messageId: msg.id,
        metadata: { messageId: msg.id },
      });
    } catch (error) {
      // 실패 시 버튼 상태 롤백
      setFeedbackSentByMessageId((prev) => ({ ...prev, [msg.id]: undefined }));
      const message = error instanceof Error ? error.message : '알 수 없는 오류';
      pushAssistantMessage(`피드백 저장 실패: ${message}`, 'system');
    }
  };

  const applyToPanel = (requestData: any) => {
    if (!requestData) return;
    requestInputApply(requestData);
  };

  // 좌표가 해석된 지점은 좌표로(재지오코딩 회피), 아니면 주소 문자열로 미리보기를 실행한다.
  const previewRouteOnMap = async (
    rawRequest: any,
    opts: { useSanitizedFallback?: boolean; closeOnSuccess?: boolean; silent?: boolean } = {}
  ) => {
    if (!rawRequest) return;
    const { useSanitizedFallback = false, closeOnSuccess = true, silent = false } = opts;
    const requestData = useSanitizedFallback
      ? sanitizeRequestDataForPreview(rawRequest)
      : rawRequest;
    setPreviewError(null);
    setIsPreviewLoading(true);
    applyToPanel(requestData);
    setMultiDriverResult(null);

    const toCoord = (p: any) =>
      p && typeof p === 'object' && Number.isFinite(p.latitude) && Number.isFinite(p.longitude)
        ? { lat: Number(p.latitude), lng: Number(p.longitude), address: String(p.address || '') }
        : null;
    const toAddr = (p: any) => (typeof p === 'string' ? p : String(p?.address || ''));

    const originCoord = toCoord(requestData.origins?.[0]);
    const destPoints: any[] = requestData.destinations || [];
    const destCoords = destPoints.map(toCoord);
    const allResolved = Boolean(originCoord) && destCoords.length > 0 && destCoords.every(Boolean);

    const commonOptions = {
      optimizeOrder: requestData.optimizeOrder ?? previewMode === 'optimized-order',
      useRealtimeTraffic: requestData.useRealtimeTraffic,
      departureAt: requestData.departureAt || null,
      deliveryTimes: requestData.deliveryTimes || [],
      isNextDayFlags: requestData.isNextDayFlags || [],
      useExplicitDestination: Boolean(requestData.useExplicitDestination || requestData.finalDestinationAddress),
      returnToOrigin: requestData.returnToOrigin ?? true,
      roadOption: requestData.roadOption || 'time-first',
    };

    try {
      const result = await optimizeRouteWith(
        allResolved
          ? {
              origins: originCoord,
              destinations: destCoords as any,
              vehicleType: requestData.vehicleType,
              options: commonOptions,
              dwellMinutes: requestData.dwellMinutes || [],
            }
          : {
              rawOrigins: requestData.origins?.[0] ? [toAddr(requestData.origins[0])] : [],
              rawDestinations: destPoints.map(toAddr),
              vehicleType: requestData.vehicleType,
              options: commonOptions,
              dwellMinutes: requestData.dwellMinutes || [],
            }
      );

      if (!result.success) {
        const baseMessage = result.error || '경로 계산에 실패했습니다. 입력 값을 확인해주세요.';
        const failedAddress = String(result?.details?.diagnostics?.failedAddresses?.[0]?.address || '').trim();
        const usedQueries = Array.isArray(result?.details?.diagnostics?.usedQueries)
          ? (result.details.diagnostics.usedQueries as string[]).filter(Boolean).slice(0, 3)
          : [];
        const detailSummary =
          failedAddress || usedQueries.length
            ? [
              failedAddress ? `실패 주소: ${failedAddress}` : null,
              usedQueries.length ? `시도 쿼리: ${usedQueries.join(' / ')}` : null,
            ]
              .filter(Boolean)
              .join('\n')
            : null;
        const message = detailSummary ? `${baseMessage}\n${detailSummary}` : baseMessage;
        if (!silent) {
          setPreviewError(message);
          pushAssistantMessage(`지도로 반영하지 못했어요: ${message}`, 'system');
        }
        return;
      }

      if (!silent) pushAssistantMessage('좌측 패널과 지도에 견적 조건을 반영했어요.', 'system');
      if (closeOnSuccess) onClose(); // 명시적 "지도에서 보기"일 때만 닫는다.
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handlePreviewOnMap = (useSanitizedFallback = false) =>
    previewRouteOnMap(latestResult?.routeRequest, { useSanitizedFallback });

  // 시나리오 비교에서 특정 시나리오를 앱 지도에 표시.
  // routes를 직접 넘기면(인라인 카드) 그것을, 없으면 latestResult를 사용.
  const handleScenarioSelect = (
    label: string,
    routes?: Array<{ label: string; routeRequest: any }>
  ) => {
    const pool = routes ?? latestResult?.scenarioRoutes;
    const match = pool?.find((s) => s.label === label);
    if (!match?.routeRequest) {
      pushAssistantMessage('이 시나리오의 경로 정보를 찾지 못했어요. 다시 견적을 요청해 주세요.', 'system');
      return;
    }
    void previewRouteOnMap(match.routeRequest);
  };

  /** 추천(기본) 시나리오/경로를 모달은 열어둔 채 지도에 자동 반영(하이브리드). */
  const autoPreviewedKeyRef = useRef<string | null>(null);
  const autoPreviewRecommended = (payload: AIQuoteResponse) => {
    const recLabel = payload.scenarioComparison?.recommendedLabel ?? null;
    const recRoute = recLabel
      ? payload.scenarioRoutes?.find((s) => s.label === recLabel)?.routeRequest
      : undefined;
    const target = recRoute ?? payload.routeRequest;
    if (!target) return;
    const key = JSON.stringify({ o: target.origins, d: target.destinations, dep: target.departureAt });
    if (autoPreviewedKeyRef.current === key) return; // 동일 경로 중복 자동표시 방지
    autoPreviewedKeyRef.current = key;
    void previewRouteOnMap(target, { closeOnSuccess: false, silent: true });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[4000] flex items-center justify-center glass-overlay p-4 md:p-6 transition-opacity duration-300">
      <div className="flex h-full w-full max-w-6xl lg:max-w-[1280px] xl:max-w-[1500px] 2xl:max-w-[1720px] overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-black/5 flex-col md:flex-row">

        {/* Main Chat Area */}
        <div className="flex flex-1 flex-col h-full min-w-0 bg-card relative">

          {/* Header */}
          <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-6 py-4 bg-card z-10">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground leading-tight">AI 텍스트 견적챗</h2>
                <p className="text-xs text-muted-foreground font-medium">GPT-4o & Tmap 기반 실시간 계산</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAuthForm((prev) => !prev);
                  setAuthError(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${authUserEmail
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted'
                  }`}
              >
                {authUserEmail ? '로그인됨' : '로그인'}
              </button>
              {authUserEmail && (
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  disabled={isAuthLoading}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                >
                  로그아웃
                </button>
              )}
              <button
                onClick={handleReset}
                className="p-2 text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors hidden md:block"
                title="새 대화 시작"
              >
                <RefreshCw className="h-5 w-5" />
              </button>

              {/* Mobile Close Button */}
              <button
                onClick={onClose}
                className="md:hidden p-2 text-muted-foreground hover:text-muted-foreground hover:bg-muted rounded-full transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>

          {(showAuthForm || authError) && (
            <div className="px-4 md:px-8 py-3 border-b border-border bg-slate-50/80">
              {authUserEmail ? (
                <div className="flex flex-wrap items-center gap-2 text-[12px]">
                  <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
                    로그인 계정: {authUserEmail}
                  </span>
                  <span className="text-muted-foreground">채팅 저장, 파일 업로드/생성, 피드백 기능이 활성화됩니다.</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-col gap-2 md:flex-row">
                    <input
                      type="email"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="이메일"
                      className="w-full md:w-[240px] rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                    />
                    <input
                      type="password"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void handleSignIn();
                        }
                      }}
                      placeholder="비밀번호"
                      className="w-full md:w-[220px] rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSignIn()}
                      disabled={isAuthLoading}
                      className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                    >
                      {isAuthLoading ? '로그인 중...' : '로그인'}
                    </button>
                  </div>
                  {authError && <div className="text-xs text-rose-600">{authError}</div>}
                </div>
              )}
            </div>
          )}

          {/* Messages Scroll Area */}
          <div
            className="relative flex-1 overflow-y-auto px-4 py-6 md:px-8 space-y-6 scroll-smooth custom-scrollbar bg-slate-50/50"
            onDragOver={(e) => {
              if (e.dataTransfer?.types?.includes('Files')) {
                e.preventDefault();
                setIsDragging(true);
              }
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setIsDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer?.files?.length) void handleUploadFiles(e.dataTransfer.files);
            }}
          >
            {isDragging && (
              <div className="absolute inset-3 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50/80 backdrop-blur-sm pointer-events-none">
                <div className="flex items-center gap-2 text-sm font-semibold text-indigo-700">
                  <Paperclip className="w-4 h-4" />
                  여기에 파일을 놓으면 첨부됩니다
                </div>
              </div>
            )}
            {messages.map((msg, idx) => (
              <div
                key={msg.id}
                className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} ${msg.structured ? 'max-w-[95%] md:max-w-[88%]' : 'max-w-[85%] md:max-w-[75%]'}`}>

                  {/* Avatar */}
                  <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${msg.role === 'user'
                    ? 'bg-slate-200 text-muted-foreground'
                    : 'bg-indigo-100 text-indigo-600'
                    }`}>
                    {msg.role === 'user' ? <span className="text-xs font-bold">나</span> : <Sparkles className="h-4 w-4" />}
                  </div>

                  {/* Message Bubble */}
                  <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`relative px-5 py-3.5 text-[15px] leading-relaxed shadow-sm ${msg.role === 'user'
                        ? 'bg-slate-800 text-white rounded-2xl rounded-tr-sm'
                        : msg.kind === 'system'
                          ? 'bg-warning-muted text-warning border border-warning/20 rounded-xl'
                          : 'bg-card text-foreground border border-border rounded-2xl rounded-tl-sm'
                        }`}
                    >
                      {renderMessageBody(msg)}
                    </div>
                    {msg.role === 'assistant' && msg.structured && (
                      <div className="mt-3 w-full space-y-3">
                        {msg.structured.scenarioComparison && (
                          <ScenarioComparisonCard
                            comparison={msg.structured.scenarioComparison}
                            routeErrors={msg.structured.scenarioRouteErrors}
                            realtimeTraffic={msg.structured.realtimeTraffic}
                            departureAt={msg.structured.departureAt}
                            onSelect={(r) => handleScenarioSelect(r.label, msg.structured?.scenarioRoutes)}
                          />
                        )}
                        {msg.structured.departureMatrix && (
                          <DepartureMatrixCard matrix={msg.structured.departureMatrix} />
                        )}
                        {!msg.structured.scenarioComparison && Boolean(msg.structured.routeRequest) && (
                          <button
                            type="button"
                            onClick={() => void previewRouteOnMap(msg.structured?.routeRequest)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                          >
                            <MapIcon className="h-3.5 w-3.5" />
                            지도에서 보기
                          </button>
                        )}
                      </div>
                    )}
                    {shouldRenderEvidence(msg) && (
                      <div className="mt-2 w-full max-w-[560px]">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedEvidenceByMessageId((prev) => ({
                              ...prev,
                              [msg.id]: !prev[msg.id],
                            }))
                          }
                          className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted"
                        >
                          <Sparkles className="w-3 h-3 text-indigo-500" />
                          근거/출처 보기
                          <span className="text-muted-foreground">
                            ({(msg.evidence?.sources || []).length})
                          </span>
                        </button>
                        {expandedEvidenceByMessageId[msg.id] && (
                          <div className="mt-2 rounded-xl border border-border bg-card p-3 text-xs text-foreground shadow-sm">
                            {!!msg.evidence?.basis?.length && (
                              <div className="mb-2">
                                <div className="mb-1 text-[11px] font-semibold text-muted-foreground">근거 요약</div>
                                <div className="space-y-1">
                                  {msg.evidence.basis.slice(0, 3).map((basis, basisIdx) => (
                                    <div key={`${msg.id}-basis-${basisIdx}`} className="leading-relaxed">
                                      - {basis}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {!!msg.evidence?.sources?.length && (
                              <div>
                                <div className="mb-1 text-[11px] font-semibold text-muted-foreground">출처</div>
                                <div className="space-y-1.5">
                                  {msg.evidence.sources.slice(0, 5).map((src, srcIdx) => (
                                    <div
                                      key={`${msg.id}-src-${srcIdx}`}
                                      className="flex items-start gap-2 rounded-lg border border-border bg-muted px-2 py-1.5"
                                    >
                                      <span className="mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-slate-200 text-foreground">
                                        {src.type === 'web' ? '웹' : src.type === 'attachment' ? '첨부' : '내부'}
                                      </span>
                                      <div className="min-w-0">
                                        {src.url ? (
                                          <a
                                            href={src.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="block truncate text-indigo-600 hover:underline"
                                          >
                                            {src.label}
                                          </a>
                                        ) : (
                                          <div className="truncate text-foreground">{src.label}</div>
                                        )}
                                        {src.url && (
                                          <div className="text-[10px] text-muted-foreground mt-0.5">
                                            {getDomainFromUrl(src.url)}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {!!msg.evidence?.fetchedAt && (
                              <div className="mt-2 text-[10px] text-muted-foreground">
                                확인 시각: {new Date(msg.evidence.fetchedAt).toLocaleString('ko-KR')}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    <span className="text-[10px] text-muted-foreground mt-1 px-1">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {msg.role === 'assistant' && msg.kind !== 'system' && (
                      <div className="mt-1 px-1 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void submitFeedback(msg, 'positive')}
                          disabled={!!feedbackSentByMessageId[msg.id]}
                          className={`text-[10px] flex items-center gap-1 ${feedbackSentByMessageId[msg.id] === 'positive' ? 'text-indigo-600 font-bold' : 'text-muted-foreground hover:text-indigo-600'} ${feedbackSentByMessageId[msg.id] && feedbackSentByMessageId[msg.id] !== 'positive' ? 'hidden' : ''}`}
                        >
                          <ThumbsUp className="w-3 h-3" /> 도움이 됐어요
                        </button>
                        {!feedbackSentByMessageId[msg.id] && <span className="text-muted-foreground text-[8px]">|</span>}
                        <button
                          type="button"
                          onClick={() => void submitFeedback(msg, 'negative')}
                          disabled={!!feedbackSentByMessageId[msg.id]}
                          className={`text-[10px] flex items-center gap-1 ${feedbackSentByMessageId[msg.id] === 'negative' ? 'text-rose-600 font-bold' : 'text-muted-foreground hover:text-rose-600'} ${feedbackSentByMessageId[msg.id] && feedbackSentByMessageId[msg.id] !== 'negative' ? 'hidden' : ''}`}
                        >
                          <ThumbsDown className="w-3 h-3" /> 아쉬워요
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start w-full">
                <div className="flex items-start gap-3 max-w-[85%]">
                  <div className="flex-shrink-0 h-8 w-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                  <div className="bg-card px-4 py-3 rounded-2xl rounded-tl-sm border border-border shadow-sm">
                    {agentSteps.length === 0 ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">분석 중입니다...</span>
                        <span className="flex space-x-1">
                          <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                          <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                          <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></span>
                        </span>
                      </div>
                    ) : (
                      <ul className="space-y-1.5 min-w-[180px]">
                        {agentSteps.map((s) => (
                          <li key={s.name} className="flex items-center gap-2 text-sm">
                            {s.phase === 'done' ? (
                              <Check className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                            ) : s.phase === 'error' ? (
                              <X className="h-3.5 w-3.5 text-rose-500 flex-shrink-0" />
                            ) : (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500 flex-shrink-0" />
                            )}
                            <span className={s.phase === 'done' ? 'text-muted-foreground' : 'text-foreground'}>{s.label}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} className="h-4" />
          </div>

          {/* Input Area (Floating Style) */}
          <div className="flex-shrink-0 px-4 md:px-8 pb-6 pt-2 bg-gradient-to-t from-white via-white to-transparent">
            {!loading && latestResult && messages.some((m) => m.role === 'user') && (
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleRegenerate}
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-indigo-600 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  다시 생성
                </button>
              </div>
            )}
            {!!latestResult?.suggestedPrompts?.length && (
              <div className="mb-2 flex gap-2 overflow-x-auto hide-scrollbar">
                {latestResult.suggestedPrompts.map((prompt, idx) => (
                  <button
                    key={`${prompt}-${idx}`}
                    onClick={() => {
                      setInput(prompt);
                      if (textareaRef.current) {
                        textareaRef.current.focus();
                        requestAnimationFrame(autoResize);
                      }
                    }}
                    className="flex-shrink-0 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-xs font-medium text-amber-800 hover:bg-amber-100 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
            {/* Quick Templates */}
            <div className="flex gap-2 overflow-x-auto pb-3 hide-scrollbar mask-linear-fade">
              {quickTemplates.map((template, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setInput(template);
                    if (textareaRef.current) {
                      textareaRef.current.focus();
                      requestAnimationFrame(autoResize);
                    }
                  }}
                  className="flex-shrink-0 inline-flex items-center px-3 py-1.5 rounded-full bg-card border border-border text-xs font-medium text-muted-foreground hover:border-indigo-300 hover:text-indigo-600 hover:shadow-sm transition-all whitespace-nowrap"
                >
                  <Sparkles className="w-3 h-3 mr-1.5 text-indigo-400" />
                  {template.length > 24 ? template.slice(0, 24) + '...' : template}
                </button>
              ))}
            </div>

            <div className="relative group">
              <div className="relative flex items-end bg-card rounded-xl shadow-lg border border-border overflow-hidden focus-within:ring-2 focus-within:ring-indigo-100 transition-shadow">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => handleUploadFiles(e.target.files)}
                  accept=".pdf,.xlsx,.xls,.docx,.doc,.png,.jpg,.jpeg,.gif,.webp"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || loading}
                  className="mb-2 ml-2 p-2 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-50"
                  title="파일 첨부"
                >
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                </button>
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    autoResize();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  onPaste={(e) => {
                    const files = Array.from(e.clipboardData?.files || []);
                    if (files.length) {
                      e.preventDefault();
                      const dt = new DataTransfer();
                      files.forEach((f) => dt.items.add(f));
                      void handleUploadFiles(dt.files);
                    }
                  }}
                  placeholder={loading ? '답변을 생성하고 있어요…' : '무엇을 도와드릴까요? (예: 내일 강남에서 마포로 퀵 보낼래)'}
                  disabled={loading}
                  className="w-full max-h-[200px] min-h-[56px] py-4 pl-5 pr-14 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground resize-none focus:outline-none scrollbar-thin disabled:opacity-60"
                  rows={1}
                />
                {loading ? (
                  <button
                    type="button"
                    onClick={handleStopGeneration}
                    title="생성 중단"
                    className="absolute right-2 bottom-2 p-2.5 rounded-lg bg-rose-500 text-white shadow-md hover:bg-rose-600 transition-all active:scale-95"
                  >
                    <Square className="w-4 h-4 fill-current" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSend()}
                    disabled={!input.trim()}
                    className="absolute right-2 bottom-2 p-2.5 rounded-lg bg-indigo-600 text-white shadow-md hover:bg-indigo-700 disabled:bg-gray-200 disabled:cursor-not-allowed transition-all active:scale-95"
                  >
                    <ArrowRight className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
            {!!attachments.length && (
              <div className="mt-2 flex flex-wrap gap-2">
                {attachments.slice(-4).map((attachment) => (
                  <div
                    key={attachment.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-muted text-[11px] text-muted-foreground"
                    title={attachment.file_name}
                  >
                    <FileText className="w-3 h-3" />
                    <span className="max-w-[160px] truncate">{attachment.file_name}</span>
                    <span className={`text-[10px] ${attachment.parse_status === 'parsed' ? 'text-emerald-600' : attachment.parse_status === 'failed' ? 'text-rose-600' : 'text-amber-600'}`}>
                      {attachment.parse_status}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="text-center mt-2">
              <p className="text-[10px] text-muted-foreground">
                AI는 실수를 할 수 있습니다. 중요한 정보는 확인해 주세요.
              </p>
            </div>
          </div>
        </div>

        {/* Info Sidebar (Right Panel) */}
        <div className="hidden md:flex w-[340px] lg:w-[420px] xl:w-[500px] 2xl:w-[560px] flex-shrink-0 flex-col border-l border-border bg-slate-50/50">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-white/50">
            <h3 className="font-bold text-foreground flex items-center gap-2">
              <Calculator className="w-4 h-4 text-muted-foreground" />
              실시간 견적 현황
            </h3>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-muted-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">대화방</div>
                <button
                  onClick={async () => {
                    const created = await createNewSession();
                    if (!created) return;
                    setLatestResult(null);
                    setAttachments([]);
                    setGeneratedFiles([]);
                    setMessages([
                      {
                        id: createMessageId(),
                        role: 'assistant',
                        kind: 'system',
      content: WELCOME_MESSAGE,
      timestamp: new Date(),
                      },
                    ]);
                    await persistMessage(
                      created.id,
                      'system',
                      WELCOME_MESSAGE
                    );
                    await fetchAttachments(created.id);
                    await fetchGeneratedFiles(created.id);
                  }}
                  className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  + 새 대화
                </button>
              </div>
              <div className="bg-card rounded-xl border border-border p-2 shadow-sm max-h-48 overflow-y-auto space-y-1">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className={`w-full text-left px-2 py-2 rounded-lg transition-colors ${currentSessionId === session.id
                      ? 'bg-indigo-50 text-indigo-800'
                      : 'hover:bg-muted text-foreground'
                      }`}
                  >
                    <button
                      onClick={() => handleSelectSession(session.id)}
                      className="w-full text-left px-1"
                    >
                      <div className="text-xs font-semibold truncate">{session.title}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(session.updated_at).toLocaleString('ko-KR', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </button>
                    <div className="mt-1 flex justify-end">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void handleDeleteSession(session.id);
                        }}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="w-3 h-3" />
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
                {!sessions.length && (
                  <div className="px-2 py-2 text-[11px] text-muted-foreground">저장된 대화가 없습니다.</div>
                )}
              </div>
              {isSessionLoading && (
                <div className="text-[11px] text-muted-foreground">대화를 불러오는 중...</div>
              )}
              {!sessionPersistenceEnabled && (
                <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                  서버 대화 저장이 비활성화되어 로컬 임시 대화로 동작 중입니다.
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">첨부 파일</div>
              <div className="bg-card rounded-xl border border-border p-2 shadow-sm max-h-40 overflow-y-auto space-y-1">
                {attachments.map((attachment) => (
                  <div key={attachment.id} className="px-2 py-1.5 rounded-lg border border-border bg-muted">
                    <div className="text-[11px] font-semibold text-foreground truncate">{attachment.file_name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {attachment.file_type} · {(attachment.file_size / 1024).toFixed(1)}KB · {attachment.parse_status}
                    </div>
                  </div>
                ))}
                {!attachments.length && (
                  <div className="px-2 py-2 text-[11px] text-muted-foreground">첨부된 파일이 없습니다.</div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">생성 파일</div>
                <div className="flex items-center gap-1">
                  {(['pdf', 'xlsx', 'md', 'docx', 'json'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleGenerateFile(type)}
                      disabled={isGeneratingFile || !currentSessionId}
                      className="px-2 py-1 rounded-md border border-indigo-200 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                    >
                      {type.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-card rounded-xl border border-border p-2 shadow-sm max-h-44 overflow-y-auto space-y-1">
                {generatedFiles.map((file) => (
                  <a
                    key={file.id}
                    href={file.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full flex items-center justify-between px-2 py-2 rounded-lg border border-border hover:bg-muted"
                  >
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-foreground truncate">{file.file_name}</div>
                      <div className="text-[10px] text-muted-foreground">{file.file_type.toUpperCase()} · {(file.file_size / 1024).toFixed(1)}KB</div>
                    </div>
                    <Download className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  </a>
                ))}
                {!generatedFiles.length && (
                  <div className="px-2 py-2 text-[11px] text-muted-foreground">생성된 파일이 없습니다.</div>
                )}
              </div>
            </div>

            {/* Status Status */}
            <div className="space-y-3">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">진행 상태</div>
              <div className="bg-card rounded-xl border border-border p-4 shadow-sm space-y-3">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${latestResult?.extracted ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                  <span className={`text-sm ${latestResult?.extracted ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>입력 정보 분석</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${latestResult?.routeSummary ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                  <span className={`text-sm ${latestResult?.routeSummary ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>경로 최적화 (Tmap)</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${latestResult?.quote ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                  <span className={`text-sm ${latestResult?.quote ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>최종 견적 산출</span>
                </div>
              </div>
            </div>

            {/* Extracted Info Card */}
            <div className="space-y-3">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">추출 정보</div>
              <div className="bg-card rounded-xl border border-border p-4 shadow-sm space-y-4">
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-indigo-500 mt-0.5" />
                  <div className="w-full min-w-0">
                    <div className="text-xs text-muted-foreground mb-0.5">경유지 정보</div>
                    <div className="space-y-1.5 mt-1">
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 text-[10px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">출발</span>
                        <span className="text-sm font-medium text-foreground truncate">{latestResult?.extracted?.origin?.address || '-'}</span>
                      </div>
                      {latestResult?.extracted?.destinations?.map((d: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-2 relative">
                          <div className="absolute -top-1.5 left-2 w-px h-1.5 bg-gray-200"></div>
                          <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${idx === (latestResult.extracted.destinations.length - 1)
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-blue-100 text-blue-700'
                            }`}>
                            {idx === (latestResult.extracted.destinations.length - 1) ? '도착' : `경유 ${idx + 1}`}
                          </span>
                          <span className="text-sm font-medium text-foreground truncate">{d.address || '-'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Truck className="w-4 h-4 text-indigo-500 mt-0.5" />
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">차량 정보</div>
                    <div className="text-sm font-medium text-foreground">
                      {latestResult?.extracted?.vehicleType || '-'}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Clock className="w-4 h-4 text-indigo-500 mt-0.5" />
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">일정</div>
                    <div className="text-sm font-medium text-foreground">
                      {latestResult?.extracted?.departureTime || '-'} 출발 · {latestResult?.extracted?.scheduleType === 'regular' ? '정기' : '비정기'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Scenario Comparison (다중 시나리오: 3/5/10개 지점) */}
            {latestResult?.scenarioComparison && (
              <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">시나리오 비교</div>
                <ScenarioComparisonCard
                  comparison={latestResult.scenarioComparison}
                  routeErrors={latestResult.scenarioRouteErrors}
                  onSelect={(r) => handleScenarioSelect(r.label)}
                />
              </div>
            )}

            {/* 결과 빠른 액션 칩 */}
            {!loading && (latestResult?.quote || latestResult?.scenarioComparison) && (
              <div className="flex flex-wrap gap-2 animate-in fade-in duration-500">
                <button
                  type="button"
                  onClick={() => handleSend('같은 조건으로 레이와 스타렉스를 모두 비교해줘')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border text-xs font-medium text-foreground hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                >
                  <Truck className="w-3.5 h-3.5" />
                  다른 차종으로 비교
                </button>
                <button
                  type="button"
                  onClick={() => handleSend('시간당 요금제와 단건 요금제를 모두 보여줘')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border text-xs font-medium text-foreground hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                >
                  <Calculator className="w-3.5 h-3.5" />
                  다른 요금제로 보기
                </button>
                <button
                  type="button"
                  onClick={() => handleGenerateFile('pdf')}
                  disabled={isGeneratingFile || !currentSessionId || currentSessionId.startsWith('local-')}
                  title={!currentSessionId || currentSessionId.startsWith('local-') ? '로그인 후 저장된 세션에서 사용할 수 있어요' : undefined}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border text-xs font-medium text-foreground hover:border-indigo-300 hover:text-indigo-600 transition-colors disabled:opacity-50"
                >
                  {isGeneratingFile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                  PDF 견적서
                </button>
              </div>
            )}

            {/* 지오코딩 실패 복구: 실패한 지점의 정확한 주소를 직접 지정하도록 유도 */}
            {!loading && !!latestResult?.scenarioRouteErrors?.length && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-2 animate-in fade-in duration-500">
                <div className="font-semibold">일부 지점의 좌표를 찾지 못했어요. 정확한 도로명 주소로 다시 시도해 보세요.</div>
                <div className="flex flex-wrap gap-2">
                  {latestResult.scenarioRouteErrors.map((e) => (
                    <button
                      key={e.label}
                      type="button"
                      onClick={() => {
                        setInput(`${e.label} 시나리오에서 좌표를 못 찾은 지점의 정확한 도로명 주소를 알려줄게(예: 서울 ○○구 ○○로 12): `);
                        if (textareaRef.current) {
                          textareaRef.current.focus();
                          requestAnimationFrame(autoResize);
                        }
                      }}
                      className="px-2.5 py-1 rounded-full border border-amber-300 bg-card text-amber-800 hover:bg-amber-100 transition-colors"
                    >
                      {e.label} 주소 직접 지정
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quote Result Card (Highlight) */}
            {latestResult?.quote && (
              <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                  <span>예상 견적</span>
                  <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium normal-case">
                    기준: {latestResult.quote.basis?.vehicleType} · {latestResult.quote.basis?.scheduleType === 'regular' ? '정기' : '비정기'}
                  </span>
                </div>
                <div className="bg-primary rounded-2xl p-5 text-white shadow-xl">

                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="text-indigo-200 text-[10px] font-bold uppercase tracking-wider mb-1">시간당 1회</div>
                      <div className="text-xl font-black tracking-tight">
                        {latestResult.quote.hourly?.formatted}
                      </div>
                      {latestResult.quote.hourly?.tiers && (
                        <div className="mt-1.5 space-y-0.5 text-[10px] text-indigo-100/90 leading-tight">
                          <div>
                            일일 <span className="font-semibold text-white">{latestResult.quote.hourly.tiers.perDay?.formatted}</span>
                          </div>
                          <div>
                            20일 <span className="font-semibold text-white">{latestResult.quote.hourly.tiers.perMonth20d?.formatted}</span>
                          </div>
                          <div className="text-indigo-200/70 text-[9px]">유류할증 제외 · 운임표 기준</div>
                        </div>
                      )}
                    </div>
                    <div className="w-px self-stretch bg-indigo-400/30 mx-3"></div>
                    <div className="text-right">
                      <div className="text-indigo-200 text-[10px] font-bold uppercase tracking-wider mb-1">단건 요금제</div>
                      <div className="text-xl font-black tracking-tight">
                        {latestResult.quote.perJob?.formatted}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-white/10 rounded-lg p-2">
                      <div className="text-[10px] text-indigo-200">운행 거리</div>
                      <div className="text-sm font-bold">{latestResult.quote.basis?.distanceKm}km</div>
                    </div>
                    <div className="bg-white/10 rounded-lg p-2">
                      <div className="text-[10px] text-indigo-200">총 소요 시간</div>
                      <div className="text-sm font-bold">
                        {latestResult.quote.basis?.totalBillMinutes}분
                        <div className="text-[9px] font-normal text-indigo-200/80 mt-0.5">
                          운행 {latestResult.quote.basis?.driveMinutes}분 + 체류 {latestResult.quote.basis?.dwellTotalMinutes}분
                        </div>
                      </div>
                    </div>
                  </div>

                  {latestResult.quote.hourly?.advisor?.message && (
                    <div className="mb-4 rounded-lg bg-amber-50/95 border border-amber-200 px-3 py-2 text-[11px] leading-snug text-amber-900 shadow-sm">
                      <span className="font-semibold">단가 인하 구간 안내</span>
                      <span className="block mt-0.5 text-amber-800">
                        {latestResult.quote.hourly.advisor.message.replace(/^\u{1F4A1}\s*/u, '')}
                      </span>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewMode('input-order')}
                        className={`rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors ${previewMode === 'input-order'
                            ? 'bg-card text-indigo-700 border-indigo-300'
                            : 'bg-indigo-50/60 text-indigo-600 border-indigo-200 hover:bg-indigo-50'
                          }`}
                      >
                        입력순 미리보기
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewMode('optimized-order')}
                        className={`rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors ${previewMode === 'optimized-order'
                            ? 'bg-card text-indigo-700 border-indigo-300'
                            : 'bg-indigo-50/60 text-indigo-600 border-indigo-200 hover:bg-indigo-50'
                          }`}
                      >
                        최적화순 미리보기
                      </button>
                    </div>
                    <button
                      onClick={() => void handlePreviewOnMap(false)}
                      disabled={isPreviewLoading}
                      className="w-full bg-card text-indigo-700 py-3 rounded-xl text-sm font-bold hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {isPreviewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapIcon className="w-4 h-4" />}
                      {isPreviewLoading ? '지도 반영 중...' : '지도에서 경로 확인하기'}
                    </button>
                    {previewError && (
                      <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700 space-y-2">
                        <div>{previewError}</div>
                        <button
                          type="button"
                          onClick={() => void handlePreviewOnMap(true)}
                          disabled={isPreviewLoading}
                          className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-card px-2 py-1 text-[10px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                        >
                          <RefreshCw className={`w-3 h-3 ${isPreviewLoading ? 'animate-spin' : ''}`} />
                          자동 수정으로 재시도
                        </button>
                      </div>
                    )}
                    <button
                      onClick={() => setIsQuoteDetailOpen(true)}
                      className="w-full bg-indigo-100/70 text-indigo-800 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-100 transition-colors"
                    >
                      전체 운임 시나리오 비교
                    </button>
                  </div>
                </div>

                <SingleQuoteInsights
                  vehicleType={latestResult.quote.basis?.vehicleType}
                  distanceKm={latestResult.quote.basis?.distanceKm}
                  driveMinutes={latestResult.quote.basis?.driveMinutes}
                  dwellMinutes={latestResult.quote.basis?.dwellTotalMinutes}
                />
              </div>
            )}

          </div>
        </div>
      </div>
      {isQuoteDetailOpen && latestResult?.quote && (
        <QuoteDetailModal quote={latestResult.quote} onClose={() => setIsQuoteDetailOpen(false)} />
      )}
    </div>
  );
}
