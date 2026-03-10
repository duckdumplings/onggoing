'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouteOptimization } from '@/hooks/useRouteOptimization';
import { X, Send, MapPin, Truck, Clock, Calculator, ArrowRight, Loader2, Sparkles, Map as MapIcon, ChevronRight, RefreshCw } from 'lucide-react';

type ChatMessage = {
  role: 'assistant' | 'user';
  content: string;
  kind?: 'normal' | 'system' | 'result';
  timestamp: Date;
};

type AIQuoteResponse = {
  success: boolean;
  assistantMessage?: string;
  suggestedPrompts?: string[];
  extracted?: any;
  missingFields?: string[];
  followUpQuestions?: Array<{ field: string; question: string }>;
  quote?: any;
  routeSummary?: any;
  assumptions?: string[];
  routeRequest?: any;
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
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
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

  const pushAssistantMessage = (content: string, kind: ChatMessage['kind'] = 'normal') => {
    setMessages((prev) => [...prev, { role: 'assistant', content, kind, timestamp: new Date() }]);
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
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content,
          kind: m.role === 'system' ? 'system' : 'normal',
          timestamp: new Date(m.created_at),
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

  const handleReset = () => {
    if (confirm('새로운 대화를 시작하시겠습니까? 기존 대화 내용은 사라집니다.')) {
      (async () => {
        const created = await createNewSession();
        if (created) {
          setLatestResult(null);
          setInput('');
          setMessages([
            {
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
      } else {
        const created = await createNewSession();
        if (created) {
          setMessages([
            {
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
    })();
  }, [isOpen]);

  const handleSend = async () => {
    const message = input.trim();
    if (!message || loading) return;

    setMessages((prev) => [...prev, { role: 'user', content: message, timestamp: new Date() }]);
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
              
              const history = messages.slice(-20).map(m => ({
                role: m.role,
                content: m.content
              }));

              const res = await fetch('/api/quote/ai-chat-generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  message,
                  history,
                  conversationContext,
                }),
              });
      const json = (await res.json()) as AIQuoteResponse;
      setLatestResult(json);

      if (!json.success) {
        if (json.assistantMessage) {
          pushAssistantMessage(json.assistantMessage, 'normal');
          if (sessionId) {
            await persistMessage(sessionId, 'assistant', json.assistantMessage, {
              error: json.error || null,
              suggestedPrompts: json.suggestedPrompts || [],
            });
          }
        } else {
          const fallbackError = `오류가 발생했습니다: ${json.error?.message || '알 수 없는 오류'}`;
          pushAssistantMessage(fallbackError);
          if (sessionId) {
            await persistMessage(sessionId, 'assistant', fallbackError, {
              error: json.error || null,
            });
          }
        }
        return;
      }

      const hasQuote = Boolean(json.quote);
      
      // 1. 서버가 구성한 대화형 메시지를 우선 출력
      if (json.assistantMessage) {
        pushAssistantMessage(json.assistantMessage, hasQuote ? 'result' : 'normal');
        if (sessionId) {
          await persistMessage(sessionId, 'assistant', json.assistantMessage, {
            quote: json.quote || null,
            routeSummary: json.routeSummary || null,
          });
        }
      } else {
        // Fallback: AI 답변이 없을 때만 하드코딩 메시지 사용
        if (hasQuote) {
          const fallbackContent = `견적 산출이 완료되었습니다.\n추천 요금제는 **${json.quote.recommendedPlan === 'hourly' ? '시간당 요금제' : '단건 요금제'}**이며, 예상 견적가는 **${json.quote.totalPriceFormatted}**입니다.`;
          pushAssistantMessage(fallbackContent, 'result');
          if (sessionId) {
            await persistMessage(sessionId, 'assistant', fallbackContent, {
              quote: json.quote || null,
              routeSummary: json.routeSummary || null,
            });
          }
        } else {
          // 정보가 부족한데 AI가 아무 말도 안 했을 때 (드문 경우)
          const fallbackContent = '정보가 조금 더 필요합니다. 출발지와 목적지를 알려주시겠어요?';
          pushAssistantMessage(fallbackContent, 'normal');
          if (sessionId) {
            await persistMessage(sessionId, 'assistant', fallbackContent);
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
    await loadSessionMessages(sessionId);
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
    handleApplyToPanel();
    window.multiDriverResult = null;

    await optimizeRouteWith({
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
        returnToOrigin: requestData.returnToOrigin ?? true,
        roadOption: requestData.roadOption || 'time-first',
      },
      dwellMinutes: requestData.dwellMinutes || [],
    });
    pushAssistantMessage('✅ 좌측 패널과 지도에 견적 조건을 반영했습니다.', 'system');
    onClose(); // 지도 확인을 위해 모달 닫기
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
                key={idx}
                className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex max-w-[85%] md:max-w-[75%] gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  
                  {/* Avatar */}
                  <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
                    msg.role === 'user' 
                      ? 'bg-slate-200 text-slate-600' 
                      : 'bg-indigo-100 text-indigo-600'
                  }`}>
                    {msg.role === 'user' ? <span className="text-xs font-bold">나</span> : <Sparkles className="h-4 w-4" />}
                  </div>

                  {/* Message Bubble */}
                  <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`relative px-5 py-3.5 text-[15px] leading-relaxed shadow-sm ${
                        msg.role === 'user'
                          ? 'bg-slate-800 text-white rounded-2xl rounded-tr-sm'
                          : msg.kind === 'system'
                            ? 'bg-amber-50 text-amber-900 border border-amber-100 rounded-xl'
                            : 'bg-white text-slate-800 border border-gray-100 rounded-2xl rounded-tl-sm'
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    </div>
                    <span className="text-[10px] text-gray-400 mt-1 px-1">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
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
                    setMessages([
                      {
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
                  }}
                  className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  + 새 대화
                </button>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 p-2 shadow-sm max-h-48 overflow-y-auto space-y-1">
                {sessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => handleSelectSession(session.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                      currentSessionId === session.id
                        ? 'bg-indigo-50 text-indigo-800'
                        : 'hover:bg-gray-50 text-gray-700'
                    }`}
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
                      className="w-full bg-white text-indigo-700 py-3 rounded-xl text-sm font-bold hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2"
                    >
                      <MapIcon className="w-4 h-4" />
                      지도에서 경로 확인하기
                    </button>
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
