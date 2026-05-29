'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useRouteOptimization } from '@/hooks/useRouteOptimization';
import { X, Send, MapPin, Truck, Clock, Calculator, ArrowRight, Loader2, Sparkles, Map as MapIcon, ChevronRight, RefreshCw, Paperclip, Download, FileText, Trash2, Check, Square, ThumbsUp, ThumbsDown } from 'lucide-react';
import { supabase } from '@/libs/supabase-client';
import ScenarioComparisonCard from '@/domains/dispatch/components/ScenarioComparisonCard';
import SingleQuoteInsights from '@/domains/dispatch/components/SingleQuoteInsights';
import type { ScenarioComparison } from '@/domains/dispatch/services/scenarioComparison';

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  kind?: 'normal' | 'system' | 'result';
  timestamp: Date;
  evidence?: AIQuoteResponse['evidence'];
  sourceUserText?: string;
};

type AIQuoteResponse = {
  success: boolean;
  assistantMessage?: string;
  suggestedPrompts?: string[];
  evidence?: {
    basis?: string[];
    sources?: Array<{ type: 'internal' | 'attachment' | 'web'; label: string; url?: string }>;
    fetchedAt?: string;
  };
  extracted?: any;
  missingFields?: string[];
  followUpQuestions?: Array<{ field: string; question: string }>;
  quote?: any;
  routeSummary?: any;
  scenarioComparison?: ScenarioComparison;
  scenarioRouteErrors?: Array<{ label: string; message: string }>;
  scenarioRoutes?: Array<{ label: string; routeRequest: any }>;
  assumptions?: string[];
  routeRequest?: any;
  routeRequestMeta?: {
    usedSanitizedPayload?: boolean;
  };
  pipeline?: {
    stageState?: 'blocked' | 'need-input' | 'completed';
    readiness?: { score?: number; isReady?: boolean; reasons?: string[] };
  };
  rag?: { sources?: string[]; attachmentIds?: string[] };
  error?: { code: string; message: string };
};

type ChatSession = {
  id: string;
  title: string;
  last_summary?: string | null;
  created_at: string;
  updated_at: string;
};

type PersistedChatMessage = {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, unknown>;
  created_at: string;
};

type ChatAttachment = {
  id: string;
  session_id: string;
  file_url: string;
  file_name: string;
  file_type: string;
  file_size: number;
  parse_status: 'pending' | 'parsed' | 'failed';
  parse_error?: string | null;
  created_at: string;
};

type GeneratedFile = {
  id: string;
  session_id: string;
  file_type: 'pdf' | 'xlsx' | 'md' | 'txt' | 'docx' | 'json';
  file_name: string;
  file_url: string;
  file_size: number;
  created_at: string;
};

interface AIQuoteChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

declare global {
  interface Window {
    setRouteOptimizerInput?: (requestData: any) => void;
    multiDriverResult?: any;
  }
}

export default function AIQuoteChatModal({ isOpen, onClose }: AIQuoteChatModalProps) {
  const { optimizeRouteWith } = useRouteOptimization();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: `msg-${Date.now()}-welcome`,
      role: 'assistant',
      kind: 'system',
      content: '안녕하세요! 배송 견적을 도와드릴까요?\n출발지, 목적지, 차량, 시간 정보를 편하게 말씀해 주세요.',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [agentSteps, setAgentSteps] = useState<Array<{ name: string; label: string; phase: 'start' | 'done' | 'error' }>>([]);
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

  const createMessageId = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const isSmallTalkMessage = (text?: string) => {
    const normalized = String(text || '').trim().toLowerCase();
    if (!normalized) return false;
    if (normalized.length > 24) return false;
    if (normalized.length <= 3) return true;
    return /^(안녕|하이|ㅎㅇ|hello|hi|고마워|감사|응|네|ㅇㅋ|ok|오케이|잘가|굿모닝|좋은아침|반가워)[!~.\s?]*$/.test(normalized);
  };

  const shouldRenderEvidence = (msg: ChatMessage) => {
    if (msg.role !== 'assistant') return false;
    if (!msg.evidence) return false;
    const hasEvidence = Boolean(msg.evidence.basis?.length || msg.evidence.sources?.length);
    if (!hasEvidence) return false;
    if (isSmallTalkMessage(msg.sourceUserText)) return false;
    if (msg.kind === 'system') return false;
    return true;
  };

  const getDomainFromUrl = (url?: string) => {
    if (!url) return null;
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  };

  const pushAssistantMessage = (
    content: string,
    kind: ChatMessage['kind'] = 'normal',
    options?: { evidence?: AIQuoteResponse['evidence']; sourceUserText?: string }
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
      },
    ]);
  };

  const normalizeAddressForPreview = (address: string) =>
    String(address || '')
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/^서울시\s+/, '서울특별시 ')
      .replace(/(\d+)\s*충/g, '$1층')
      .replace(/(로|길|대로)(\d)/g, '$1 $2')
      .replace(/(로)\s*(\d+)\s*가길\s*(\d+)/g, '$1$2가길 $3')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/(?:지하\s*)?\d+\s*(?:층|충)/g, ' ')
      .replace(/\d+\s*호/g, ' ')
      .replace(/\d+\s*동/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const sanitizeRequestDataForPreview = (requestData: any) => {
    const origin = requestData?.origins?.[0] ? normalizeAddressForPreview(String(requestData.origins[0])) : '';
    const destinations = Array.isArray(requestData?.destinations)
      ? requestData.destinations.map((d: string) => normalizeAddressForPreview(String(d)))
      : [];
    return {
      ...requestData,
      origins: origin ? [origin] : [],
      destinations,
      finalDestinationAddress: destinations.length ? destinations[destinations.length - 1] : null,
    };
  };

  const renderMessageBody = (msg: ChatMessage) => {
    if (msg.role === 'user') {
      return <div className="whitespace-pre-wrap break-words">{msg.content}</div>;
    }

    const raw = String(msg.content || '').trim();
    if (!raw) return null;

    return (
      <div className="text-[15px] leading-7 break-words space-y-2">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => <p className="leading-7 [&:not(:first-child)]:mt-2">{children}</p>,
            strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
            em: ({ children }) => <em className="italic">{children}</em>,
            ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 my-1">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 my-1">{children}</ol>,
            li: ({ children }) => <li className="leading-6">{children}</li>,
            a: ({ children, href }) => (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline hover:text-indigo-700">
                {children}
              </a>
            ),
            h1: ({ children }) => <h3 className="text-base font-bold text-foreground mt-3 mb-1">{children}</h3>,
            h2: ({ children }) => <h3 className="text-base font-bold text-foreground mt-3 mb-1">{children}</h3>,
            h3: ({ children }) => <h4 className="text-sm font-semibold text-foreground mt-2 mb-0.5">{children}</h4>,
            h4: ({ children }) => <h4 className="text-sm font-semibold text-foreground mt-2 mb-0.5">{children}</h4>,
            hr: () => <hr className="my-3 border-border" />,
            blockquote: ({ children }) => (
              <blockquote className="border-l-2 border-border pl-3 text-muted-foreground my-1">{children}</blockquote>
            ),
            code: ({ children }) => (
              <code className="px-1 py-0.5 rounded bg-muted text-[13px] font-mono text-foreground">{children}</code>
            ),
            pre: ({ children }) => (
              <pre className="bg-gray-900 text-gray-100 rounded-lg p-3 overflow-x-auto text-[13px] my-2">{children}</pre>
            ),
            table: ({ children }) => (
              <div className="my-2 overflow-x-auto">
                <table className="w-full text-sm border-collapse">{children}</table>
              </div>
            ),
            thead: ({ children }) => <thead>{children}</thead>,
            th: ({ children }) => (
              <th className="text-left font-medium text-muted-foreground border-b border-border py-1.5 px-2 whitespace-nowrap">{children}</th>
            ),
            td: ({ children }) => <td className="py-1.5 px-2 border-b border-border align-top">{children}</td>,
          }}
        >
          {raw}
        </ReactMarkdown>
      </div>
    );
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

  const getAuthHeaders = async (base?: HeadersInit): Promise<HeadersInit | undefined> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return undefined;
    const headers = new Headers(base || {});
    headers.set('Authorization', `Bearer ${token}`);
    return Object.fromEntries(headers.entries());
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
        content: '안녕하세요! 배송 견적을 도와드릴까요?\n출발지, 목적지, 차량, 시간 정보를 편하게 말씀해 주세요.',
        timestamp: new Date(),
      },
    ]);
    await persistMessage(
      created.id,
      'system',
      '안녕하세요! 배송 견적을 도와드릴까요?\n출발지, 목적지, 차량, 시간 정보를 편하게 말씀해 주세요.'
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
      const headers = await getAuthHeaders();
      if (!headers) {
        setSessionPersistenceEnabled(false);
        return [] as ChatSession[];
      }
      const res = await fetch('/api/quote/chat-sessions?limit=50', {
        headers,
      });
      if (!res.ok) {
        setSessionPersistenceEnabled(false);
        return [] as ChatSession[];
      }
      const json = await res.json();
      if (!json?.success) return [] as ChatSession[];
      const list = (json.data || []) as ChatSession[];
      setSessionPersistenceEnabled(true);
      setSessions(list);
      return list;
    } catch {
      setSessionPersistenceEnabled(false);
      return [] as ChatSession[];
    }
  };

  const createNewSession = async (title?: string) => {
    try {
      const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
      if (!headers) throw new Error('NO_AUTH_SESSION');
      const res = await fetch('/api/quote/chat-sessions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: title || `견적 대화 ${new Date().toLocaleDateString('ko-KR')}`,
        }),
      });
      if (!res.ok) throw new Error(`HTTP_${res.status}`);
      const json = await res.json();
      if (!json?.success) throw new Error('CREATE_SESSION_FAILED');
      const created = json.data as ChatSession;
      setSessionPersistenceEnabled(true);
      await fetchSessions();
      setCurrentSessionId(created.id);
      return created;
    } catch {
      const localId = `local-${Date.now()}`;
      const created: ChatSession = {
        id: localId,
        title: title || `로컬 대화 ${new Date().toLocaleDateString('ko-KR')}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_summary: null,
      };
      setSessionPersistenceEnabled(false);
      setSessions((prev) => [created, ...prev.filter((s) => !s.id.startsWith('local-'))]);
      setCurrentSessionId(localId);
      return created;
    }
  };

  const loadSessionMessages = async (sessionId: string) => {
    if (sessionId.startsWith('local-')) return;
    setIsSessionLoading(true);
    try {
      const res = await fetch(`/api/quote/chat-sessions/${sessionId}/messages`, {
        headers: (await getAuthHeaders()) ?? undefined,
      });
      const json = await res.json();
      if (!json?.success) return;
      const persisted = (json.data || []) as PersistedChatMessage[];
      if (persisted.length === 0) {
        setMessages([
          {
            id: createMessageId(),
            role: 'assistant',
            kind: 'system',
            content: '안녕하세요! 배송 견적을 도와드릴까요?\n출발지, 목적지, 차량, 시간 정보를 편하게 말씀해 주세요.',
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
    const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
    await fetch(`/api/quote/chat-sessions/${sessionId}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ role, content, metadata: metadata || {} }),
    });
  };

  const fetchAttachments = async (sessionId: string) => {
    if (sessionId.startsWith('local-')) {
      setAttachments([]);
      return;
    }
    const res = await fetch(`/api/quote/chat-sessions/${sessionId}/attachments`, {
      headers: (await getAuthHeaders()) ?? undefined,
    });
    const json = await res.json();
    if (!json?.success) return;
    setAttachments((json.data || []) as ChatAttachment[]);
  };

  const fetchGeneratedFiles = async (sessionId: string) => {
    if (sessionId.startsWith('local-')) {
      setGeneratedFiles([]);
      return;
    }
    const res = await fetch(`/api/quote/chat-sessions/${sessionId}/generated-files`, {
      headers: (await getAuthHeaders()) ?? undefined,
    });
    const json = await res.json();
    if (!json?.success) return;
    setGeneratedFiles((json.data || []) as GeneratedFile[]);
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
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`/api/quote/chat-sessions/${sessionId}/attachments`, {
          method: 'POST',
          headers: (await getAuthHeaders()) ?? undefined,
          body: formData,
        });
        const json = await res.json();
        if (!json?.success) {
          pushAssistantMessage(`파일 업로드 실패: ${file.name} (${json?.error?.message || '알 수 없는 오류'})`, 'system');
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
      const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch(`/api/quote/chat-sessions/${currentSessionId}/generated-files`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          fileType,
          input: {
            sessionTitle: sessions.find((s) => s.id === currentSessionId)?.title,
            userRequest: lastUser,
            assistantMessage: lastAssistant,
            quote: latestResult?.quote,
            routeSummary: latestResult?.routeSummary,
            extracted: latestResult?.extracted,
            assumptions: latestResult?.assumptions || [],
            ragSources: latestResult?.rag?.sources || [],
          },
        }),
      });
      const json = await res.json();
      if (!json?.success) {
        pushAssistantMessage(`파일 생성 실패: ${json?.error?.message || '알 수 없는 오류'}`, 'system');
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
              content: '안녕하세요! 배송 견적을 도와드릴까요?\n출발지, 목적지, 차량, 시간 정보를 편하게 말씀해 주세요.',
              timestamp: new Date(),
            },
          ]);
          await persistMessage(
            created.id,
            'system',
            '안녕하세요! 배송 견적을 도와드릴까요?\n출발지, 목적지, 차량, 시간 정보를 편하게 말씀해 주세요.'
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
              content: '안녕하세요! 배송 견적을 도와드릴까요?\n출발지, 목적지, 차량, 시간 정보를 편하게 말씀해 주세요.',
              timestamp: new Date(),
            },
          ]);
          await persistMessage(
            created.id,
            'system',
            '안녕하세요! 배송 견적을 도와드릴까요?\n출발지, 목적지, 차량, 시간 정보를 편하게 말씀해 주세요.'
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

      if (liveCreated) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === liveId
              ? { ...m, content: text || '(응답 없음)', kind: hasQuote ? 'result' : 'normal', evidence: payload.evidence, sourceUserText: message }
              : m
          )
        );
      } else if (text) {
        pushAssistantMessage(text, hasQuote ? 'result' : 'normal', { evidence: payload.evidence, sourceUserText: message });
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
        });
      }

      if (payload.assumptions?.length) {
        pushAssistantMessage(`참고: ${payload.assumptions.join(', ')}`, 'system');
      }
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
                content: '안녕하세요! 배송 견적을 도와드릴까요?\n출발지, 목적지, 차량, 시간 정보를 편하게 말씀해 주세요.',
                timestamp: new Date(),
              },
            ]);
          }
        }
      }
      return;
    }

    const res = await fetch(`/api/quote/chat-sessions/${sessionId}`, {
      method: 'DELETE',
      headers: (await getAuthHeaders()) ?? undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.success) {
      pushAssistantMessage(`대화방 삭제 실패: ${json?.error?.message || '알 수 없는 오류'}`, 'system');
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
              content: '안녕하세요! 배송 견적을 도와드릴까요?\n출발지, 목적지, 차량, 시간 정보를 편하게 말씀해 주세요.',
              timestamp: new Date(),
            },
          ]);
          await persistMessage(
            created.id,
            'system',
            '안녕하세요! 배송 견적을 도와드릴까요?\n출발지, 목적지, 차량, 시간 정보를 편하게 말씀해 주세요.'
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
      const res = await fetch('/api/quote/chat-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSessionId && !currentSessionId.startsWith('local-') ? currentSessionId : null,
          userInput: msg.sourceUserText || 'unknown',
          assistantOutput: msg.content,
          feedbackType: type,
          messageId: msg.id,
          metadata: { messageId: msg.id },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `HTTP_${res.status}`);
      }
    } catch (error) {
      // 실패 시 버튼 상태 롤백
      setFeedbackSentByMessageId((prev) => ({ ...prev, [msg.id]: undefined }));
      const message = error instanceof Error ? error.message : '알 수 없는 오류';
      pushAssistantMessage(`피드백 저장 실패: ${message}`, 'system');
    }
  };

  const applyToPanel = (requestData: any) => {
    if (!requestData) return;
    if (typeof window.setRouteOptimizerInput === 'function') {
      window.setRouteOptimizerInput(requestData);
    }
    window.dispatchEvent(
      new CustomEvent('ai-quote-apply', {
        detail: { requestData },
      })
    );
  };

  const handleApplyToPanel = () => applyToPanel(latestResult?.routeRequest);

  // 좌표가 해석된 지점은 좌표로(재지오코딩 회피), 아니면 주소 문자열로 미리보기를 실행한다.
  const previewRouteOnMap = async (rawRequest: any, useSanitizedFallback = false) => {
    if (!rawRequest) return;
    const requestData = useSanitizedFallback
      ? sanitizeRequestDataForPreview(rawRequest)
      : rawRequest;
    setPreviewError(null);
    setIsPreviewLoading(true);
    applyToPanel(requestData);
    window.multiDriverResult = null;

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
        setPreviewError(message);
        pushAssistantMessage(`지도로 반영하지 못했어요: ${message}`, 'system');
        return;
      }

      pushAssistantMessage('좌측 패널과 지도에 견적 조건을 반영했어요.', 'system');
      onClose(); // 성공 시에만 닫기
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handlePreviewOnMap = (useSanitizedFallback = false) =>
    previewRouteOnMap(latestResult?.routeRequest, useSanitizedFallback);

  // 시나리오 비교에서 특정 시나리오를 앱 지도에 표시.
  const handleScenarioSelect = (label: string) => {
    const match = latestResult?.scenarioRoutes?.find((s) => s.label === label);
    if (!match?.routeRequest) {
      pushAssistantMessage('이 시나리오의 경로 정보를 찾지 못했어요. 다시 견적을 요청해 주세요.', 'system');
      return;
    }
    void previewRouteOnMap(match.routeRequest);
  };

  const renderQuoteDetailModal = () => {
    if (!isQuoteDetailOpen || !latestResult?.quote) return null;
    const q = latestResult.quote;

    const formatWonStr = (val: number) => `₩${Math.round(val).toLocaleString('ko-KR')}`;

    return (
      <div className="fixed inset-0 z-[4100] flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
            <h3 className="text-base font-bold text-foreground">운임 시나리오 상세</h3>
            <button
              onClick={() => setIsQuoteDetailOpen(false)}
              className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-muted-foreground"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-5 overflow-y-auto space-y-6 text-sm flex-1 custom-scrollbar">
            {/* 기초 정보 요약 */}
            <div className="flex items-center gap-4 bg-muted p-4 rounded-xl border border-border">
              <div className="flex-1">
                <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">총 주행 거리</div>
                <div className="text-base font-black text-foreground">{q.basis?.distanceKm ?? '-'} km</div>
              </div>
              <div className="w-px h-8 bg-slate-200"></div>
              <div className="flex-1">
                <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">예상 소요 시간</div>
                <div className="text-base font-black text-foreground">{q.basis?.totalBillMinutes ?? '-'} 분</div>
              </div>
              <div className="w-px h-8 bg-slate-200"></div>
              <div className="flex-1">
                <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">경유지</div>
                <div className="text-base font-black text-foreground">{q.basis?.destinationCount ?? '-'} 곳</div>
              </div>
            </div>

            {/* 시나리오 매트릭스 */}
            {q.scenarios && (
              <div className="space-y-4">
                <h4 className="font-bold text-foreground flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-indigo-500" />
                  전체 운임 비교 테이블
                </h4>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[500px]">
                    <thead>
                      <tr>
                        <th className="py-3 px-4 bg-muted border-b border-border text-xs font-bold text-muted-foreground rounded-tl-xl">차량/스케줄</th>
                        <th className="py-3 px-4 bg-muted border-b border-border text-xs font-bold text-muted-foreground">시간당 요금제</th>
                        <th className="py-3 px-4 bg-muted border-b border-border text-xs font-bold text-muted-foreground rounded-tr-xl">단건 요금제</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {/* 레이 / 비정기 */}
                      <tr className="border-b border-border hover:bg-muted transition-colors">
                        <td className="py-3 px-4 font-semibold text-foreground">
                          레이 <span className="text-muted-foreground font-medium text-[11px] ml-1">비정기</span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-foreground">{formatWonStr(q.scenarios.ray?.['ad-hoc']?.hourlyTotal || 0)}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-foreground">{formatWonStr(q.scenarios.ray?.['ad-hoc']?.perJobTotal || 0)}</div>
                        </td>
                      </tr>
                      {/* 레이 / 정기 */}
                      <tr className="border-b border-border hover:bg-muted transition-colors">
                        <td className="py-3 px-4 font-semibold text-foreground">
                          레이 <span className="text-muted-foreground font-medium text-[11px] ml-1">정기</span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-foreground">{formatWonStr(q.scenarios.ray?.regular?.hourlyTotal || 0)}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-foreground">{formatWonStr(q.scenarios.ray?.regular?.perJobTotal || 0)}</div>
                        </td>
                      </tr>
                      {/* 스타렉스 / 비정기 */}
                      <tr className="border-b border-border hover:bg-muted transition-colors">
                        <td className="py-3 px-4 font-semibold text-foreground">
                          스타렉스 <span className="text-muted-foreground font-medium text-[11px] ml-1">비정기</span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-foreground">{formatWonStr(q.scenarios.starex?.['ad-hoc']?.hourlyTotal || 0)}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-foreground">{formatWonStr(q.scenarios.starex?.['ad-hoc']?.perJobTotal || 0)}</div>
                        </td>
                      </tr>
                      {/* 스타렉스 / 정기 */}
                      <tr className="hover:bg-muted transition-colors">
                        <td className="py-3 px-4 font-semibold text-foreground rounded-bl-xl">
                          스타렉스 <span className="text-muted-foreground font-medium text-[11px] ml-1">정기</span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-foreground">{formatWonStr(q.scenarios.starex?.regular?.hourlyTotal || 0)}</div>
                        </td>
                        <td className="py-3 px-4 rounded-br-xl">
                          <div className="font-bold text-foreground">{formatWonStr(q.scenarios.starex?.regular?.perJobTotal || 0)}</div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="text-[11px] text-muted-foreground leading-relaxed bg-muted p-3 rounded-lg border border-border">
              * 시간당 요금제: {q.basis?.totalBillMinutes}분 과금 기준 (시간단가 적용 + 유류할증)<br />
              * 단건 요금제: 기본 운임 + 경유지 추가 요금 (경유지 {Math.max(0, (q.basis?.destinationCount || 1) - 1)}곳)<br />
              * 정기 배송의 단건 운임은 별도 정기 요금표가 적용되며, 시간당 운임은 동일한 단가를 기초로 계산됩니다.
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[4000] flex items-center justify-center glass-overlay p-4 md:p-6 transition-opacity duration-300">
      <div className="flex h-full w-full max-w-6xl overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-black/5 flex-col md:flex-row">

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
                <div className={`flex max-w-[85%] md:max-w-[75%] gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>

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
        <div className="hidden md:flex w-[340px] flex-col border-l border-border bg-slate-50/50">

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
                        content: '안녕하세요! 배송 견적을 도와드릴까요?\n출발지, 목적지, 차량, 시간 정보를 편하게 말씀해 주세요.',
                        timestamp: new Date(),
                      },
                    ]);
                    await persistMessage(
                      created.id,
                      'system',
                      '안녕하세요! 배송 견적을 도와드릴까요?\n출발지, 목적지, 차량, 시간 정보를 편하게 말씀해 주세요.'
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
      {renderQuoteDetailModal()}
    </div>
  );
}
