'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouteOptimization } from '@/hooks/useRouteOptimization';
import { X, Send, MapPin, Truck, Clock, Calculator, ArrowRight, Loader2, Sparkles, Map as MapIcon, ChevronRight, RefreshCw, Paperclip, Download, FileText, Trash2 } from 'lucide-react';

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
  assumptions?: string[];
  routeRequest?: any;
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
  const [expandedEvidenceByMessageId, setExpandedEvidenceByMessageId] = useState<Record<string, boolean>>({});
  const [feedbackSentByMessageId, setFeedbackSentByMessageId] = useState<Record<string, boolean>>({});

  const conversationContext = useMemo(() => {
    if (!latestResult?.extracted) return undefined;
    return {
      vehicleType: latestResult.extracted.vehicleType,
      scheduleType: latestResult.extracted.scheduleType,
      knownAddresses: [
        latestResult.extracted.origin?.address,
        ...(latestResult.extracted.destinations || []).map((d: any) => d.address),
      ].filter(Boolean),
    };
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

  const renderMessageBody = (msg: ChatMessage) => {
    if (msg.role === 'user') {
      return <div className="whitespace-pre-wrap break-words">{msg.content}</div>;
    }

    const raw = String(msg.content || '').trim();
    if (!raw) return null;
    const blocks = raw.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);

    return (
      <div className="space-y-3 text-[15px] leading-7">
        {blocks.map((block, blockIndex) => {
          const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
          const isOrderedList = lines.length >= 2 && lines.every((line) => /^\d+\.\s+/.test(line));
          const isBulletList = lines.length >= 2 && lines.every((line) => /^[-*•]\s+/.test(line));
          const isHeading = lines.length === 1 && /:$/.test(lines[0]) && lines[0].length <= 36;

          if (isOrderedList) {
            return (
              <ol key={`block-${blockIndex}`} className="list-decimal pl-5 space-y-1.5">
                {lines.map((line, lineIndex) => (
                  <li key={`block-${blockIndex}-line-${lineIndex}`}>{line.replace(/^\d+\.\s+/, '')}</li>
                ))}
              </ol>
            );
          }

          if (isBulletList) {
            return (
              <ul key={`block-${blockIndex}`} className="list-disc pl-5 space-y-1.5">
                {lines.map((line, lineIndex) => (
                  <li key={`block-${blockIndex}-line-${lineIndex}`}>{line.replace(/^[-*•]\s+/, '')}</li>
                ))}
              </ul>
            );
          }

          if (isHeading) {
            return (
              <h4 key={`block-${blockIndex}`} className="text-[13px] font-semibold text-slate-600">
                {lines[0]}
              </h4>
            );
          }

          return (
            <p key={`block-${blockIndex}`} className="whitespace-pre-wrap break-words">
              {block}
            </p>
          );
        })}
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
    return ['출발지: 강남역, 목적지: 판교역, 차량: 레이', '내일 오전 10시 출발, 정기 배송으로 계산해줘'];
  }, [latestResult?.suggestedPrompts, messages]);

  const fetchSessions = async () => {
    try {
      const res = await fetch('/api/quote/chat-sessions?limit=50');
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
      const res = await fetch('/api/quote/chat-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      const res = await fetch(`/api/quote/chat-sessions/${sessionId}/messages`);
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
    await fetch(`/api/quote/chat-sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, content, metadata: metadata || {} }),
    });
  };

  const fetchAttachments = async (sessionId: string) => {
    if (sessionId.startsWith('local-')) {
      setAttachments([]);
      return;
    }
    const res = await fetch(`/api/quote/chat-sessions/${sessionId}/attachments`);
    const json = await res.json();
    if (!json?.success) return;
    setAttachments((json.data || []) as ChatAttachment[]);
  };

  const fetchGeneratedFiles = async (sessionId: string) => {
    if (sessionId.startsWith('local-')) {
      setGeneratedFiles([]);
      return;
    }
    const res = await fetch(`/api/quote/chat-sessions/${sessionId}/generated-files`);
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
      const res = await fetch(`/api/quote/chat-sessions/${currentSessionId}/generated-files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  const handleSend = async () => {
    const message = input.trim();
    if (!message || loading) return;

    setMessages((prev) => [...prev, { id: createMessageId(), role: 'user', content: message, timestamp: new Date() }]);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '56px'; // 초기 높이로 리셋
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

      const res = await fetch('/api/quote/ai-chat-generate', {
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
      });
      const json = (await res.json()) as AIQuoteResponse;
      setLatestResult(json);

      if (!json.success) {
        if (json.assistantMessage) {
          pushAssistantMessage(json.assistantMessage, 'normal', { evidence: json.evidence, sourceUserText: message });
          if (sessionId) {
            await persistMessage(sessionId, 'assistant', json.assistantMessage, {
              error: json.error || null,
              suggestedPrompts: json.suggestedPrompts || [],
              evidence: json.evidence || null,
              sourceUserText: message,
            });
          }
        } else {
          const fallbackError = `오류가 발생했습니다: ${json.error?.message || '알 수 없는 오류'}`;
          pushAssistantMessage(fallbackError, 'normal', { evidence: json.evidence, sourceUserText: message });
          if (sessionId) {
            await persistMessage(sessionId, 'assistant', fallbackError, {
              error: json.error || null,
              evidence: json.evidence || null,
              sourceUserText: message,
            });
          }
        }
        return;
      }

      const hasQuote = Boolean(json.quote);

      // 1. 서버가 구성한 대화형 메시지를 우선 출력
      if (json.assistantMessage) {
        pushAssistantMessage(json.assistantMessage, hasQuote ? 'result' : 'normal', {
          evidence: json.evidence,
          sourceUserText: message,
        });
        if (sessionId) {
          await persistMessage(sessionId, 'assistant', json.assistantMessage, {
            quote: json.quote || null,
            routeSummary: json.routeSummary || null,
            evidence: json.evidence || null,
            sourceUserText: message,
          });
        }
      } else {
        // Fallback: AI 답변이 없을 때만 하드코딩 메시지 사용
        if (hasQuote) {
          const fallbackContent = `견적 산출이 완료되었습니다.\n추천 요금제는 **${json.quote.recommendedPlan === 'hourly' ? '시간당 요금제' : '단건 요금제'}**이며, 예상 견적가는 **${json.quote.totalPriceFormatted}**입니다.`;
          pushAssistantMessage(fallbackContent, 'result', { evidence: json.evidence, sourceUserText: message });
          if (sessionId) {
            await persistMessage(sessionId, 'assistant', fallbackContent, {
              quote: json.quote || null,
              routeSummary: json.routeSummary || null,
              evidence: json.evidence || null,
              sourceUserText: message,
            });
          }
        } else {
          // 정보가 부족한데 AI가 아무 말도 안 했을 때 (드문 경우)
          const fallbackContent = '정보가 조금 더 필요합니다. 출발지와 목적지를 알려주시겠어요?';
          pushAssistantMessage(fallbackContent, 'normal', { evidence: json.evidence, sourceUserText: message });
          if (sessionId) {
            await persistMessage(sessionId, 'assistant', fallbackContent, {
              evidence: json.evidence || null,
              sourceUserText: message,
            });
          }
        }
      }

      // 2. 추가 질문(Missing Fields)이 명시적으로 온 경우, 
      //    AI 답변에서 이미 물어봤을 수 있으므로, 여기서는 "팁"이나 "시스템 가이드" 형태로 작게 보여주거나 생략하는 것이 좋음.
      //    현재는 사용자가 놓친 부분을 명확히 인지하도록 'system' 메시지로 보조적으로만 보여줌.
      //    단, AI 답변이 이미 질문을 포함하고 있다면 중복 느낌이 들 수 있으므로 체크가 필요하지만,
      //    명확성을 위해 리스트 형태는 유지하되 톤을 낮춤.
      if (!json.assistantMessage && json.followUpQuestions?.length) {
        const questionText = json.followUpQuestions.map(q => `• ${q.question}`).join('\n');
        pushAssistantMessage(questionText, 'system');
      }

      // 3. 가정이 포함된 경우 (시스템 메시지)
      if (json.assumptions?.length) {
        const assumptionText = `💡 참고: ${json.assumptions.join(', ')}`;
        // 시스템 메시지로 조용히 추가하지 않고, 툴팁이나 별도 영역에 표시하는 게 좋지만
        // 현재는 메시지 흐름에 자연스럽게 녹임
        pushAssistantMessage(assumptionText, 'system');
      }

    } catch (error) {
      pushAssistantMessage('죄송합니다. 서버 통신 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
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

    const res = await fetch(`/api/quote/chat-sessions/${sessionId}`, { method: 'DELETE' });
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

  const submitNegativeFeedback = async (message: ChatMessage) => {
    if (feedbackSentByMessageId[message.id]) return;
    const userInput = message.sourceUserText || '';
    if (!userInput.trim()) return;
    try {
      const res = await fetch('/api/quote/chat-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSessionId,
          messageId: message.id,
          userInput,
          assistantOutput: message.content,
          isHelpful: false,
          reason: '사용자 도움 안됨 피드백',
          tags: ['user-feedback', 'chat-modal'],
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        pushAssistantMessage('피드백 저장에 실패했어요. 잠시 후 다시 시도해주세요.', 'system');
        return;
      }
      setFeedbackSentByMessageId((prev) => ({ ...prev, [message.id]: true }));
    } catch {
      pushAssistantMessage('피드백 저장 중 네트워크 오류가 발생했어요.', 'system');
    }
  };

  const handleApplyToPanel = () => {
    if (!latestResult?.routeRequest) return;
    const requestData = latestResult.routeRequest;

    if (typeof window.setRouteOptimizerInput === 'function') {
      window.setRouteOptimizerInput(requestData);
    }

    window.dispatchEvent(
      new CustomEvent('ai-quote-apply', {
        detail: { requestData },
      })
    );
  };

  const handlePreviewOnMap = async () => {
    if (!latestResult?.routeRequest) return;
    const requestData = latestResult.routeRequest;
    setPreviewError(null);
    setIsPreviewLoading(true);
    handleApplyToPanel();
    window.multiDriverResult = null;

    try {
      const result = await optimizeRouteWith({
        origins: requestData.origins?.[0]
          ? { lat: 0, lng: 0, address: requestData.origins[0] }
          : null,
        destinations: (requestData.destinations || []).map((address: string) => ({
          lat: 0,
          lng: 0,
          address,
        })),
        vehicleType: requestData.vehicleType,
        options: {
          optimizeOrder: requestData.optimizeOrder,
          useRealtimeTraffic: requestData.useRealtimeTraffic,
          departureAt: requestData.departureAt || null,
          deliveryTimes: requestData.deliveryTimes || [],
          isNextDayFlags: requestData.isNextDayFlags || [],
          useExplicitDestination: Boolean(requestData.useExplicitDestination || requestData.finalDestinationAddress),
          returnToOrigin: requestData.returnToOrigin ?? true,
          roadOption: requestData.roadOption || 'time-first',
        },
        dwellMinutes: requestData.dwellMinutes || [],
      });

      if (!result.success) {
        const message = result.error || '경로 계산에 실패했습니다. 입력 값을 확인해주세요.';
        setPreviewError(message);
        pushAssistantMessage(`지도로 반영하지 못했어요: ${message}`, 'system');
        return;
      }

      pushAssistantMessage('✅ 좌측 패널과 지도에 견적 조건을 반영했습니다.', 'system');
      onClose(); // 성공 시에만 닫기
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const renderQuoteDetailModal = () => {
    if (!isQuoteDetailOpen || !latestResult?.quote) return null;
    const q = latestResult.quote;
    return (
      <div className="fixed inset-0 z-[4100] flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h3 className="text-base font-bold text-gray-900">견적 상세</h3>
            <button
              onClick={() => setIsQuoteDetailOpen(false)}
              className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-5 space-y-4 text-sm">
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
              <div className="text-xs text-indigo-600 font-semibold mb-1">최종 추천</div>
              <div className="text-xl font-black text-indigo-900">{q.totalPriceFormatted}</div>
              <div className="text-xs text-indigo-700 mt-1">
                {q.recommendedPlan === 'hourly' ? '시간당 요금제 추천' : '단건 요금제 추천'}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-gray-100 p-3">
                <div className="text-xs text-gray-500">시간당 플랜</div>
                <div className="font-bold text-gray-900">{q.hourly?.formatted || '-'}</div>
              </div>
              <div className="rounded-lg border border-gray-100 p-3">
                <div className="text-xs text-gray-500">단건 플랜</div>
                <div className="font-bold text-gray-900">{q.perJob?.formatted || '-'}</div>
              </div>
            </div>
            <div className="rounded-lg border border-gray-100 p-3 text-xs text-gray-600 space-y-1">
              <div>총 거리: {q.basis?.distanceKm ?? '-'} km</div>
              <div>총 과금시간: {q.basis?.totalBillMinutes ?? '-'} 분</div>
              <div>목적지 수: {q.basis?.destinationCount ?? '-'} 곳</div>
              <div>차량: {q.basis?.vehicleType ?? '-'}</div>
              <div>스케줄: {q.basis?.scheduleType === 'regular' ? '정기' : '비정기'}</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 md:p-6 transition-opacity duration-300">
      <div className="flex h-full w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 flex-col md:flex-row">

        {/* Main Chat Area */}
        <div className="flex flex-1 flex-col h-full min-w-0 bg-white relative">

          {/* Header */}
          <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4 bg-white/80 backdrop-blur-md z-10">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 leading-tight">AI 텍스트 견적챗</h2>
                <p className="text-xs text-gray-500 font-medium">GPT-4o & Tmap 기반 실시간 계산</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleReset}
                className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors hidden md:block"
                title="새 대화 시작"
              >
                <RefreshCw className="h-5 w-5" />
              </button>

              {/* Mobile Close Button */}
              <button
                onClick={onClose}
                className="md:hidden p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 space-y-6 scroll-smooth custom-scrollbar bg-slate-50/50">
            {messages.map((msg, idx) => (
              <div
                key={msg.id}
                className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex max-w-[85%] md:max-w-[75%] gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>

                  {/* Avatar */}
                  <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${msg.role === 'user'
                      ? 'bg-slate-200 text-slate-600'
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
                            ? 'bg-amber-50 text-amber-900 border border-amber-100 rounded-xl'
                            : 'bg-white text-slate-800 border border-gray-100 rounded-2xl rounded-tl-sm'
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
                          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                        >
                          <Sparkles className="w-3 h-3 text-indigo-500" />
                          근거/출처 보기
                          <span className="text-slate-400">
                            ({(msg.evidence?.sources || []).length})
                          </span>
                        </button>
                        {expandedEvidenceByMessageId[msg.id] && (
                          <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-sm">
                            {!!msg.evidence?.basis?.length && (
                              <div className="mb-2">
                                <div className="mb-1 text-[11px] font-semibold text-slate-500">근거 요약</div>
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
                                <div className="mb-1 text-[11px] font-semibold text-slate-500">출처</div>
                                <div className="space-y-1.5">
                                  {msg.evidence.sources.slice(0, 5).map((src, srcIdx) => (
                                    <div
                                      key={`${msg.id}-src-${srcIdx}`}
                                      className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5"
                                    >
                                      <span className="mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-slate-200 text-slate-700">
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
                                          <div className="truncate text-slate-700">{src.label}</div>
                                        )}
                                        {src.url && (
                                          <div className="text-[10px] text-slate-400 mt-0.5">
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
                              <div className="mt-2 text-[10px] text-slate-400">
                                확인 시각: {new Date(msg.evidence.fetchedAt).toLocaleString('ko-KR')}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    <span className="text-[10px] text-gray-400 mt-1 px-1">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {msg.role === 'assistant' && msg.kind !== 'system' && (
                      <div className="mt-1 px-1">
                        <button
                          type="button"
                          onClick={() => void submitNegativeFeedback(msg)}
                          disabled={feedbackSentByMessageId[msg.id]}
                          className="text-[10px] text-slate-400 hover:text-rose-600 disabled:text-emerald-600"
                        >
                          {feedbackSentByMessageId[msg.id] ? '피드백 저장됨' : '도움 안 됨'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start w-full">
                <div className="flex items-center gap-3 max-w-[85%]">
                  <div className="flex-shrink-0 h-8 w-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                  <div className="bg-white px-5 py-4 rounded-2xl rounded-tl-sm border border-gray-100 shadow-sm flex items-center gap-2">
                    <span className="text-sm text-gray-500">분석 중입니다...</span>
                    <span className="flex space-x-1">
                      <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                      <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                      <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></span>
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} className="h-4" />
          </div>

          {/* Input Area (Floating Style) */}
          <div className="flex-shrink-0 px-4 md:px-8 pb-6 pt-2 bg-gradient-to-t from-white via-white to-transparent">
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
                  className="flex-shrink-0 inline-flex items-center px-3 py-1.5 rounded-full bg-white border border-gray-200 text-xs font-medium text-gray-600 hover:border-indigo-300 hover:text-indigo-600 hover:shadow-sm transition-all whitespace-nowrap"
                >
                  <Sparkles className="w-3 h-3 mr-1.5 text-indigo-400" />
                  {template.length > 24 ? template.slice(0, 24) + '...' : template}
                </button>
              ))}
            </div>

            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-2xl opacity-20 group-hover:opacity-40 transition duration-200 blur"></div>
              <div className="relative flex items-end bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden focus-within:ring-2 focus-within:ring-indigo-100 transition-shadow">
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
                  className="mb-2 ml-2 p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50"
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
                  placeholder="무엇을 도와드릴까요? (예: 내일 강남에서 마포로 퀵 보낼래)"
                  className="w-full max-h-[200px] min-h-[56px] py-4 pl-5 pr-14 bg-transparent text-[15px] text-gray-800 placeholder:text-gray-400 resize-none focus:outline-none scrollbar-thin"
                  rows={1}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || loading}
                  className="absolute right-2 bottom-2 p-2.5 rounded-lg bg-indigo-600 text-white shadow-md hover:bg-indigo-700 disabled:bg-gray-200 disabled:cursor-not-allowed transition-all active:scale-95"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                </button>
              </div>
            </div>
            {!!attachments.length && (
              <div className="mt-2 flex flex-wrap gap-2">
                {attachments.slice(-4).map((attachment) => (
                  <div
                    key={attachment.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-slate-200 bg-slate-50 text-[11px] text-slate-600"
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
              <p className="text-[10px] text-gray-400">
                AI는 실수를 할 수 있습니다. 중요한 정보는 확인해 주세요.
              </p>
            </div>
          </div>
        </div>

        {/* Info Sidebar (Right Panel) */}
        <div className="hidden md:flex w-[340px] flex-col border-l border-gray-100 bg-slate-50/50">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-white/50">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <Calculator className="w-4 h-4 text-gray-500" />
              실시간 견적 현황
            </h3>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">대화방</div>
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
              <div className="bg-white rounded-xl border border-gray-100 p-2 shadow-sm max-h-48 overflow-y-auto space-y-1">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className={`w-full text-left px-2 py-2 rounded-lg transition-colors ${currentSessionId === session.id
                        ? 'bg-indigo-50 text-indigo-800'
                        : 'hover:bg-gray-50 text-gray-700'
                      }`}
                  >
                    <button
                      onClick={() => handleSelectSession(session.id)}
                      className="w-full text-left px-1"
                    >
                      <div className="text-xs font-semibold truncate">{session.title}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">
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
                  <div className="px-2 py-2 text-[11px] text-gray-400">저장된 대화가 없습니다.</div>
                )}
              </div>
              {isSessionLoading && (
                <div className="text-[11px] text-gray-400">대화를 불러오는 중...</div>
              )}
              {!sessionPersistenceEnabled && (
                <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                  서버 대화 저장이 비활성화되어 로컬 임시 대화로 동작 중입니다.
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">첨부 파일</div>
              <div className="bg-white rounded-xl border border-gray-100 p-2 shadow-sm max-h-40 overflow-y-auto space-y-1">
                {attachments.map((attachment) => (
                  <div key={attachment.id} className="px-2 py-1.5 rounded-lg border border-slate-100 bg-slate-50">
                    <div className="text-[11px] font-semibold text-slate-700 truncate">{attachment.file_name}</div>
                    <div className="text-[10px] text-slate-500">
                      {attachment.file_type} · {(attachment.file_size / 1024).toFixed(1)}KB · {attachment.parse_status}
                    </div>
                  </div>
                ))}
                {!attachments.length && (
                  <div className="px-2 py-2 text-[11px] text-gray-400">첨부된 파일이 없습니다.</div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">생성 파일</div>
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
              <div className="bg-white rounded-xl border border-gray-100 p-2 shadow-sm max-h-44 overflow-y-auto space-y-1">
                {generatedFiles.map((file) => (
                  <a
                    key={file.id}
                    href={file.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full flex items-center justify-between px-2 py-2 rounded-lg border border-slate-100 hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-slate-700 truncate">{file.file_name}</div>
                      <div className="text-[10px] text-slate-500">{file.file_type.toUpperCase()} · {(file.file_size / 1024).toFixed(1)}KB</div>
                    </div>
                    <Download className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                  </a>
                ))}
                {!generatedFiles.length && (
                  <div className="px-2 py-2 text-[11px] text-gray-400">생성된 파일이 없습니다.</div>
                )}
              </div>
            </div>

            {/* Status Status */}
            <div className="space-y-3">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">진행 상태</div>
              <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm space-y-3">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${latestResult?.extracted ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                  <span className={`text-sm ${latestResult?.extracted ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>입력 정보 분석</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${latestResult?.routeSummary ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                  <span className={`text-sm ${latestResult?.routeSummary ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>경로 최적화 (Tmap)</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${latestResult?.quote ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                  <span className={`text-sm ${latestResult?.quote ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>최종 견적 산출</span>
                </div>
              </div>
            </div>

            {/* Extracted Info Card */}
            <div className="space-y-3">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">추출 정보</div>
              <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm space-y-4">
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-indigo-500 mt-0.5" />
                  <div>
                    <div className="text-xs text-gray-500 mb-0.5">출발지</div>
                    <div className="text-sm font-medium text-gray-900 break-words">
                      {latestResult?.extracted?.origin?.address || '-'}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Truck className="w-4 h-4 text-indigo-500 mt-0.5" />
                  <div>
                    <div className="text-xs text-gray-500 mb-0.5">차량/목적지</div>
                    <div className="text-sm font-medium text-gray-900">
                      {latestResult?.extracted?.vehicleType || '-'} · {latestResult?.extracted?.destinations?.length || 0}곳
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Clock className="w-4 h-4 text-indigo-500 mt-0.5" />
                  <div>
                    <div className="text-xs text-gray-500 mb-0.5">일정</div>
                    <div className="text-sm font-medium text-gray-900">
                      {latestResult?.extracted?.departureTime || '-'} 출발 · {latestResult?.extracted?.scheduleType === 'regular' ? '정기' : '비정기'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Quote Result Card (Highlight) */}
            {latestResult?.quote && (
              <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">예상 견적</div>
                <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-5 text-white shadow-xl shadow-indigo-200">
                  <div className="text-indigo-100 text-xs font-medium mb-1">총 예상 금액</div>
                  <div className="text-3xl font-black tracking-tight mb-4">
                    {latestResult.quote.totalPriceFormatted}
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-white/10 rounded-lg p-2 backdrop-blur-sm">
                      <div className="text-[10px] text-indigo-200">거리</div>
                      <div className="text-sm font-bold">{latestResult.quote.basis?.distanceKm}km</div>
                    </div>
                    <div className="bg-white/10 rounded-lg p-2 backdrop-blur-sm">
                      <div className="text-[10px] text-indigo-200">시간</div>
                      <div className="text-sm font-bold">{latestResult.quote.basis?.totalBillMinutes}분</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <button
                      onClick={handlePreviewOnMap}
                      disabled={isPreviewLoading}
                      className="w-full bg-white text-indigo-700 py-3 rounded-xl text-sm font-bold hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {isPreviewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapIcon className="w-4 h-4" />}
                      {isPreviewLoading ? '지도 반영 중...' : '지도에서 경로 확인하기'}
                    </button>
                    {previewError && (
                      <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
                        {previewError}
                      </div>
                    )}
                    <button
                      onClick={() => setIsQuoteDetailOpen(true)}
                      className="w-full bg-indigo-100/70 text-indigo-800 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-100 transition-colors"
                    >
                      견적 상세 보기
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
      {renderQuoteDetailModal()}
    </div>
  );
}
