'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouteOptimization } from '@/hooks/useRouteOptimization';
import { X, Calculator, ChevronRight, ArrowRight, Loader2, Sparkles, RefreshCw, Paperclip, FileText, Square, Mic, MicOff } from 'lucide-react';
import { supabase } from '@/libs/supabase-client';
import QuoteDetailModal from '@/domains/chat/components/QuoteDetailModal';
import ChatMessageList from '@/domains/chat/components/ChatMessageList';
import QuoteInfoSidebar from '@/domains/chat/components/QuoteInfoSidebar';
import {
  createMessageId,
  sanitizeRequestDataForPreview,
  WELCOME_MESSAGE,
} from '@/domains/chat/utils';
import {
  uploadAttachmentApi,
  generateFileApi,
  submitFeedbackApi,
} from '@/domains/chat/services/chatSessionApi';
import type {
  ChatMessage,
  AIQuoteResponse,
  GeneratedFile,
  AgentStep,
  ChatStructuredPayload,
} from '@/domains/chat/types';
import type { QuoteIssuer } from '@/domains/quote/services/chatFileGenerator';
import { EMPTY_ISSUER, loadIssuer, saveIssuer, toGenerationIssuer } from '@/domains/quote/services/issuerSettings';
import { useSpeechInput } from '@/domains/chat/hooks/useSpeechInput';
import { useOnlineStatus } from '@/domains/chat/hooks/useOnlineStatus';
import { useChatSessions } from '@/domains/chat/hooks/useChatSessions';

/** 최종 페이로드에서 구조화 카드용 데이터를 추린다(없으면 undefined). */
function buildStructuredFromPayload(payload: AIQuoteResponse): ChatStructuredPayload | undefined {
  const hasAny =
    Boolean(payload.scenarioComparison) ||
    Boolean(payload.departureMatrix) ||
    Boolean(payload.auditTimeline) ||
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
    auditTimeline: payload.auditTimeline ?? undefined,
    departureAt: payload.departureAt ?? undefined,
    realtimeTraffic: true,
  };
}

/** 입력창 최대 글자수 — 과도한 페이로드 방지용 소프트 가드. */
const MAX_CHARS = 8000;

interface AIQuoteChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** true면 오버레이 모달 대신 부모를 채우는 인라인 도킹 패널로 렌더(데스크톱 우측 도크). */
  docked?: boolean;
  /** true면 우측 견적현황/발행 패널을 인라인 2단 대신 슬라이드 드로어로 전환(좁은 슬라이드오버용). */
  compact?: boolean;
}

export default function AIQuoteChatModal({ isOpen, onClose, docked = false, compact = false }: AIQuoteChatModalProps) {
  const { optimizeRouteWith, requestInputApply, setMultiDriverResult, chatPromptRequest, clearChatPrompt, workspaceTab, setWorkspaceTab, setQuoteSummary } = useRouteOptimization();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
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
  // 세션 초기화(messages 세팅) 완료 여부 — "이 경로로 견적" 자동 주입 시점 게이트.
  const [initialized, setInitialized] = useState(false);
  const pendingQuoteTextRef = useRef<string | null>(null);
  // "이 경로로 견적"과 함께 온 구조화 경로 컨텍스트(확정 주소). 자동 전송 시 함께 보낸다.
  const pendingRouteContextRef = useRef<unknown>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [latestResult, setLatestResult] = useState<AIQuoteResponse | null>(null);
  const [isQuoteDetailOpen, setIsQuoteDetailOpen] = useState(false);
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
  const online = useOnlineStatus();
  // 견적서 발행 옵션(사용자 희망 형태로 커스터마이즈)
  const [docOptionsOpen, setDocOptionsOpen] = useState(false);
  const [docRecipient, setDocRecipient] = useState('');
  const [docRecipientContact, setDocRecipientContact] = useState('');
  const [docValidDays, setDocValidDays] = useState(14);
  const [docIncludeVat, setDocIncludeVat] = useState(true);
  const [docNotes, setDocNotes] = useState('');
  // 발행처(공급자) 설정 — localStorage 보관, 견적서 생성에 주입.
  const [issuer, setIssuer] = useState<QuoteIssuer>(EMPTY_ISSUER);
  const [issuerOpen, setIssuerOpen] = useState(false);

  // 견적 요약을 공유 훅에 publish → WorkspacePanel의 [견적] 탭/대화 peek 바가 사용.
  useEffect(() => {
    if (!compact) return;
    setQuoteSummary(
      latestResult?.quote
        ? { hasQuote: true, hourly: latestResult.quote.hourly?.formatted, perJob: latestResult.quote.perJob?.formatted }
        : { hasQuote: false }
    );
  }, [compact, latestResult, setQuoteSummary]);
  useEffect(() => () => setQuoteSummary(null), [setQuoteSummary]);

  const updateIssuer = (patch: Partial<QuoteIssuer>) => {
    setIssuer((prev) => {
      const next = { ...prev, ...patch };
      saveIssuer(next);
      return next;
    });
  };
  useEffect(() => {
    setIssuer(loadIssuer());
  }, []);

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

  const { isListening, voiceSupported, toggleVoice } = useSpeechInput((transcript) => {
    setInput((prev) => (prev ? `${prev} ${transcript}` : transcript).slice(0, MAX_CHARS));
    requestAnimationFrame(autoResize);
  });

  const autoResize = () => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
  };

  const pushAssistantMessage = (
    content: string,
    kind: ChatMessage['kind'] = 'normal',
    options?: { evidence?: AIQuoteResponse['evidence']; sourceUserText?: string; structured?: ChatStructuredPayload; retryable?: boolean }
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
        retryable: options?.retryable,
      },
    ]);
  };

  // 세션·첨부·생성파일 상태 + Supabase 영속 로직(모달 호출부는 동일 이름으로 구조분해해 변경 없음).
  const {
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
  } = useChatSessions({
    setMessages,
    setLatestResult,
    setPreviewError,
    pushAssistantMessage,
  });

  // 실패한 사용자 질문을 사용자 말풍선 중복 없이 다시 전송한다(에러 버블의 "다시 시도").
  const handleRetryMessage = (sourceUserText?: string) => {
    if (loading) return;
    const text = (sourceUserText || '').trim();
    if (!text) return;
    void handleSend(text, { skipUserEcho: true });
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

  /** 현재 대화 컨텍스트 + 사용자가 지정한 견적서 옵션으로 생성 입력을 구성.
   *  override.structured가 있으면 해당 결과 카드 기준으로 시나리오를 구성한다(카드 원클릭 발행용). */
  const buildGenerationInput = (override?: { structured?: ChatStructuredPayload }) => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content;
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')?.content;
    const comparison = override?.structured?.scenarioComparison ?? latestResult?.scenarioComparison;
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
    return {
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
      // 사용자 지정 견적서 옵션
      recipientName: docRecipient.trim() || (latestResult?.extracted as any)?.customerName || undefined,
      recipientContact: docRecipientContact.trim() || undefined,
      validUntilDays: docValidDays,
      includeVat: docIncludeVat,
      notes: docNotes.trim() || undefined,
      issuer: toGenerationIssuer(issuer),
    };
  };

  /** 저장 없이 파일을 즉시 받아 브라우저 다운로드(로컬/비로그인 대화용). */
  const downloadFileDirect = async (fileType: GeneratedFile['file_type'], input: any): Promise<boolean> => {
    const res = await fetch('/api/quote/generate-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileType, input }),
    });
    if (!res.ok) return false;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const cd = res.headers.get('Content-Disposition') || '';
    const matched = cd.match(/filename\*=UTF-8''([^;]+)/);
    const a = document.createElement('a');
    a.href = url;
    a.download = matched ? decodeURIComponent(matched[1]) : `quote.${fileType}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
  };

  const handleGenerateFile = async (
    fileType: GeneratedFile['file_type'],
    override?: { structured?: ChatStructuredPayload }
  ) => {
    setIsGeneratingFile(true);
    try {
      const input = buildGenerationInput(override);
      const isPersisted = Boolean(currentSessionId && !currentSessionId.startsWith('local-'));
      if (isPersisted) {
        const result = await generateFileApi(currentSessionId as string, fileType, input);
        if (!result.success) {
          pushAssistantMessage(`파일 생성 실패: ${result.message || '알 수 없는 오류'}`, 'system');
          return;
        }
        await fetchGeneratedFiles(currentSessionId as string);
        pushAssistantMessage(`요청하신 ${fileType.toUpperCase()} 견적서를 생성했습니다. 우측 패널에서 다운로드할 수 있어요.`, 'system');
      } else {
        const ok = await downloadFileDirect(fileType, input);
        pushAssistantMessage(
          ok
            ? `${fileType.toUpperCase()} 견적서를 다운로드했어요.`
            : '견적서 생성에 실패했어요. 잠시 후 다시 시도해 주세요.',
          'system'
        );
      }
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
    setInitialized(false);
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
      // 초기화 완료 — 대기 중인 "이 경로로 견적" 주입을 이 시점 이후에 처리한다.
      setInitialized(true);
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

  const handleSend = async (
    overrideMessage?: string,
    opts?: { skipUserEcho?: boolean; mapRouteContext?: unknown }
  ) => {
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

      // 최근 메시지는 멀티턴 맥락 유실 방지를 위해 더 길게 유지(특히 긴 주소 목록/메일 붙여넣기).
      // 가장 최근 2개는 4000자, 그 외는 600자로 절단.
      const recent = messages.slice(-8);
      const history = recent.map((m, i) => ({
        role: m.role,
        content: m.content.slice(0, i >= recent.length - 2 ? 4000 : 600),
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
          mapRouteContext: opts?.mapRouteContext ?? undefined,
        }),
        signal: controller.signal,
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !res.body || !contentType.includes('text/event-stream')) {
        const json = (await res.json().catch(() => null)) as AIQuoteResponse | null;
        if (json) setLatestResult(json);
        const errMsg = json?.error?.message || '견적 처리에 실패했어요. 잠시 후 다시 시도해 주세요.';
        pushAssistantMessage(errMsg, 'normal', { sourceUserText: message, retryable: true });
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
          pushAssistantMessage('응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.', 'normal', { sourceUserText: message, retryable: true });
        }
        return;
      }

      const payload = finalPayload;
      setLatestResult(payload);

      if (!payload.success) {
        const errText = payload.error?.message || '견적 처리에 실패했어요. 잠시 후 다시 시도해 주세요.';
        if (liveCreated) {
          setMessages((prev) =>
            prev.map((m) => (m.id === liveId ? { ...m, content: liveText || errText, sourceUserText: message, retryable: true } : m))
          );
        } else {
          pushAssistantMessage(liveText || errText, 'normal', { sourceUserText: message, retryable: true });
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

      // compact(모바일)에서는 우측 견적현황이 드로어로 숨으므로 본문에 가정을 한 줄 노출한다.
      // 데스크톱은 QuoteInfoSidebar의 가정·신뢰도 배지로 상시 노출되어 중복을 피한다.
      if (compact && payload.assumptions?.length) {
        pushAssistantMessage(`참고: ${payload.assumptions.join(', ')}`, 'system');
      }

      // 하이브리드: 추천(기본) 시나리오/경로를 모달은 열어둔 채 지도에 자동 반영.
      autoPreviewRecommended(payload);
    } catch (error) {
      if ((error as any)?.name === 'AbortError') {
        pushAssistantMessage('요청을 중단했어요.', 'system');
      } else {
        pushAssistantMessage('서버와 연결이 끊어졌어요. 잠시 후 다시 시도해 주세요.', 'normal', { sourceUserText: message, retryable: true });
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

  // 지도/패널 "이 경로로 견적" 주입: 요청이 오면 대기 큐(ref)에 텍스트를 담아둔다.
  // 실제 전송은 세션 초기화(messages 세팅)가 끝난 뒤(initialized) 별도 effect에서 수행해
  // 초기화 effect가 사용자 메시지를 덮어쓰는 경합을 피한다.
  const lastQuoteNonceRef = useRef(0);
  useEffect(() => {
    if (!chatPromptRequest) return;
    if (chatPromptRequest.nonce === lastQuoteNonceRef.current) return;
    lastQuoteNonceRef.current = chatPromptRequest.nonce;
    pendingQuoteTextRef.current = chatPromptRequest.text?.trim() || null;
    pendingRouteContextRef.current = chatPromptRequest.routeContext ?? null;
    // 일회성 요청은 캡처 즉시 컨텍스트에서 비운다. 텍스트는 ref에 보존되므로
    // 전송에는 영향이 없고, 챗을 닫았다 다시 열어도 같은 견적이 재전송되지 않는다.
    clearChatPrompt();
  }, [chatPromptRequest?.nonce]);

  useEffect(() => {
    if (!isOpen || !initialized || loading) return;
    const text = pendingQuoteTextRef.current;
    if (!text) return;
    pendingQuoteTextRef.current = null;
    const routeContext = pendingRouteContextRef.current;
    pendingRouteContextRef.current = null;
    handleSend(text, { mapRouteContext: routeContext ?? undefined });
    // handleSend는 최신 클로저로 호출하며, 트리거는 초기화 완료/로딩/신규 요청에만 반응한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialized, loading, chatPromptRequest?.nonce]);

  // 마지막 사용자 질문으로 답변을 다시 생성(사용자 말풍선 중복 없이).
  const handleRegenerate = () => {
    if (loading) return;
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser?.content) return;
    void handleSend(lastUser.content, { skipUserEcho: true });
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

  // 입력창에 텍스트를 채우고 포커스(지오코딩 실패 복구 등 사이드바 액션용).
  const fillInput = (text: string) => {
    setInput(text);
    if (textareaRef.current) {
      textareaRef.current.focus();
      requestAnimationFrame(autoResize);
    }
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

  // ChatMessageList의 MessageBubble memo가 스트리밍 토큰 갱신마다 깨지지 않도록
  // 콜백 식별자를 ref로 고정한다(핸들러 본체는 매 렌더 갱신되지만 래퍼는 불변).
  const bubbleHandlersRef = useRef({
    handleRetryMessage,
    handleScenarioSelect,
    handleGenerateFile,
    submitFeedback,
    previewRouteOnMap,
  });
  bubbleHandlersRef.current = {
    handleRetryMessage,
    handleScenarioSelect,
    handleGenerateFile,
    submitFeedback,
    previewRouteOnMap,
  };
  const stableOnRetry = useCallback(
    (sourceUserText?: string) => bubbleHandlersRef.current.handleRetryMessage(sourceUserText),
    []
  );
  const stableOnScenarioSelect = useCallback(
    (label: string, routes?: Array<{ label: string; routeRequest: any }>) =>
      bubbleHandlersRef.current.handleScenarioSelect(label, routes),
    []
  );
  const stableOnGenerateFile = useCallback(
    (type: 'pdf', override?: { structured?: ChatStructuredPayload }) =>
      void bubbleHandlersRef.current.handleGenerateFile(type, override),
    []
  );
  const stableOnFeedback = useCallback(
    (msg: ChatMessage, type: 'positive' | 'negative') =>
      void bubbleHandlersRef.current.submitFeedback(msg, type),
    []
  );
  const stableOnPreviewRoute = useCallback(
    (rr: any) => void bubbleHandlersRef.current.previewRouteOnMap(rr),
    []
  );
  const stableOnOpenQuotePanel = useCallback(() => {
    // compact: 워크스페이스 '견적' 탭으로 전환. 데스크톱(상시 사이드바): 전체 운임 상세 모달.
    if (compact) setWorkspaceTab('quote');
    else setIsQuoteDetailOpen(true);
  }, [compact, setWorkspaceTab]);
  const stableOnToggleEvidence = useCallback(
    (id: string) => setExpandedEvidenceByMessageId((prev) => ({ ...prev, [id]: !prev[id] })),
    []
  );

  if (!isOpen) return null;

  return (
    <div
      className={
        docked
          ? 'h-full w-full flex flex-col bg-card'
          : 'fixed inset-0 z-[4000] flex items-center justify-center glass-overlay p-4 md:p-6 transition-opacity duration-300'
      }
    >
      <div
        className={
          docked
            ? 'relative flex h-full w-full overflow-hidden bg-card flex-row'
            : 'relative flex h-full w-full max-w-6xl lg:max-w-[1280px] xl:max-w-[1500px] 2xl:max-w-[1720px] overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-black/5 flex-col md:flex-row'
        }
      >

        {/* Main Chat Area — compact에서 '견적' 탭일 때는 숨기고 견적 패널이 전체 폭을 차지 */}
        <div className={`flex flex-1 flex-col h-full min-w-0 bg-card relative ${compact && workspaceTab === 'quote' ? 'hidden' : ''}`}>

          {/* Header */}
          <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-5 py-3.5 bg-card/95 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                <Sparkles className="h-5 w-5" />
                <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${online ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
              </div>
              <div>
                <h2 className="text-[15px] font-bold leading-tight text-foreground">AI 견적 어시스턴트</h2>
                <p className="text-[11px] font-medium text-muted-foreground">실시간 교통·요금제 기반 자동 견적</p>
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
                className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full transition-colors hidden md:block"
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
                      className="w-full md:w-[240px] rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
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
                      className="w-full md:w-[220px] rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSignIn()}
                      disabled={isAuthLoading}
                      className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
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
          <ChatMessageList
            messages={messages}
            loading={loading}
            agentSteps={agentSteps}
            isSessionLoading={isSessionLoading}
            isDragging={isDragging}
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
            expandedEvidenceByMessageId={expandedEvidenceByMessageId}
            onToggleEvidence={stableOnToggleEvidence}
            feedbackSentByMessageId={feedbackSentByMessageId}
            onFeedback={stableOnFeedback}
            onRetry={stableOnRetry}
            onScenarioSelect={stableOnScenarioSelect}
            onGenerateFile={stableOnGenerateFile}
            isGeneratingFile={isGeneratingFile}
            onPreviewRoute={stableOnPreviewRoute}
            onOpenQuotePanel={stableOnOpenQuotePanel}
          />

          {/* Input Area (Floating Style) */}
          <div className="flex-shrink-0 px-4 md:px-8 pb-6 pt-2 bg-gradient-to-t from-white via-white to-transparent">
            {compact && latestResult?.quote && (
              <button
                type="button"
                onClick={() => setWorkspaceTab('quote')}
                className="mb-2 flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-3.5 py-2 text-left shadow-sm transition-colors hover:border-primary/40"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Calculator className="h-4 w-4 flex-none text-primary" />
                  <span className="min-w-0">
                    <span className="block text-[10px] font-semibold text-muted-foreground">시간당 1회 견적</span>
                    <span className="block truncate text-sm font-black tracking-tight text-primary tabular-nums">{latestResult.quote.hourly?.formatted}</span>
                  </span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-right">
                    <span className="block text-[10px] font-semibold text-muted-foreground">단건</span>
                    <span className="block text-xs font-bold text-foreground tabular-nums">{latestResult.quote.perJob?.formatted}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </span>
              </button>
            )}
            {!loading && latestResult && messages.some((m) => m.role === 'user') && (
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleRegenerate}
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
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
                    className="flex-shrink-0 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/20 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
            {/* Quick Templates (콜드스타트: 한 번 탭으로 바로 시작) */}
            {!messages.some((m) => m.role === 'user') && !loading && (
              <p className="mb-1.5 px-1 text-[11px] font-semibold text-muted-foreground">이렇게 시작해보세요 · 탭하면 바로 견적</p>
            )}
            <div className="flex gap-2 overflow-x-auto pb-3 hide-scrollbar mask-linear-fade">
              {quickTemplates.map((template, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    const coldStart = !messages.some((m) => m.role === 'user');
                    if (coldStart && !loading) {
                      void handleSend(template);
                      return;
                    }
                    setInput(template);
                    if (textareaRef.current) {
                      textareaRef.current.focus();
                      requestAnimationFrame(autoResize);
                    }
                  }}
                  className="flex-shrink-0 inline-flex items-center px-3 py-1.5 rounded-full bg-card border border-border text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-primary hover:shadow-sm transition-all whitespace-nowrap"
                >
                  <Sparkles className="w-3 h-3 mr-1.5 text-primary/60" />
                  {template.length > 24 ? template.slice(0, 24) + '...' : template}
                </button>
              ))}
            </div>

            <div className="relative group">
              <div className="relative flex items-end bg-card rounded-2xl shadow-lg shadow-black/[0.04] border border-border overflow-hidden transition-shadow focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/10">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => handleUploadFiles(e.target.files)}
                  accept=".pdf,.xlsx,.xls,.csv,.docx,.doc,.png,.jpg,.jpeg,.gif,.webp"
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
                {voiceSupported && (
                  <button
                    type="button"
                    onClick={toggleVoice}
                    disabled={loading}
                    className={`mb-2 p-2 rounded-lg transition-colors disabled:opacity-50 ${isListening ? 'bg-rose-50 text-rose-600 animate-pulse' : 'text-muted-foreground hover:bg-muted'}`}
                    title={isListening ? '음성 입력 중지' : '음성으로 입력'}
                  >
                    {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                )}
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value.slice(0, MAX_CHARS));
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
                  placeholder={loading ? '답변을 생성하고 있어요…' : compact ? '메시지를 입력하세요…' : '무엇을 도와드릴까요? (예: 내일 강남에서 마포로 퀵 보낼래)'}
                  disabled={loading}
                  className="w-full max-h-[200px] min-h-[52px] py-3.5 pl-4 pr-14 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground placeholder:truncate resize-none focus:outline-none scrollbar-thin disabled:opacity-60"
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
                    className="absolute right-2 bottom-2 p-2.5 rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none disabled:cursor-not-allowed transition-all active:scale-95"
                  >
                    <ArrowRight className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 px-1">
              <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-amber-500 animate-pulse' : online ? 'bg-emerald-500' : 'bg-muted-foreground'}`}
                />
                <span>{loading ? '계산 중' : online ? '연결됨' : '오프라인'}</span>
                <span className="text-border">·</span>
                <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px] font-medium text-muted-foreground">Shift+Enter</kbd>
                <span>줄바꿈</span>
              </p>
              <span className={`text-[10px] tabular-nums ${input.length >= MAX_CHARS ? 'text-rose-500 font-semibold' : 'text-muted-foreground'}`}>
                {input.length.toLocaleString()}/{MAX_CHARS.toLocaleString()}
              </span>
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

        {/* 견적 현황 — compact는 '견적' 탭일 때 전체 폭, 그 외 숨김. 비compact는 상시 사이드바. */}
        <div className={compact ? (workspaceTab === 'quote' ? 'flex h-full min-w-0 flex-1' : 'hidden') : 'contents'}>
        <QuoteInfoSidebar
          compact={compact}
          sessions={sessions}
          currentSessionId={currentSessionId}
          isSessionLoading={isSessionLoading}
          sessionPersistenceEnabled={sessionPersistenceEnabled}
          onNewSession={() => void startNewSessionFromSidebar()}
          onSelectSession={(id) => void handleSelectSession(id)}
          onDeleteSession={(id) => void handleDeleteSession(id)}
          attachments={attachments}
          docOptionsOpen={docOptionsOpen}
          setDocOptionsOpen={setDocOptionsOpen}
          docRecipient={docRecipient}
          setDocRecipient={setDocRecipient}
          docRecipientContact={docRecipientContact}
          setDocRecipientContact={setDocRecipientContact}
          docValidDays={docValidDays}
          setDocValidDays={setDocValidDays}
          docIncludeVat={docIncludeVat}
          setDocIncludeVat={setDocIncludeVat}
          docNotes={docNotes}
          setDocNotes={setDocNotes}
          issuer={issuer}
          issuerOpen={issuerOpen}
          setIssuerOpen={setIssuerOpen}
          updateIssuer={updateIssuer}
          generatedFiles={generatedFiles}
          isGeneratingFile={isGeneratingFile}
          onGenerateFile={handleGenerateFile}
          loading={loading}
          latestResult={latestResult}
          onScenarioSelect={(label) => handleScenarioSelect(label)}
          onSend={(message) => void handleSend(message)}
          onFillInput={fillInput}
          previewMode={previewMode}
          setPreviewMode={setPreviewMode}
          isPreviewLoading={isPreviewLoading}
          previewError={previewError}
          onPreviewOnMap={(useSanitizedFallback) => void handlePreviewOnMap(useSanitizedFallback)}
          onOpenQuoteDetail={() => setIsQuoteDetailOpen(true)}
        />
        </div>
      </div>
      {isQuoteDetailOpen && latestResult?.quote && (
        <QuoteDetailModal quote={latestResult.quote} onClose={() => setIsQuoteDetailOpen(false)} />
      )}
    </div>
  );
}
