'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  Loader2,
  Sparkles,
  Map as MapIcon,
  RefreshCw,
  Paperclip,
  FileText,
  Check,
  ThumbsUp,
  ThumbsDown,
  ArrowDown,
} from 'lucide-react';
import ScenarioComparisonCard from '@/domains/dispatch/components/ScenarioComparisonCard';
import DepartureMatrixCard from '@/domains/dispatch/components/DepartureMatrixCard';
import AuditTimelineCard from '@/domains/dispatch/components/AuditTimelineCard';
import CaseBoardCard from '@/domains/dispatch/components/CaseBoardCard';
import QuoteResultCard from '@/domains/dispatch/components/QuoteResultCard';
import ChatMarkdown from '@/domains/chat/components/ChatMarkdown';
import { shouldRenderEvidence, getDomainFromUrl, WELCOME_MESSAGE } from '@/domains/chat/utils';
import type { ChatMessage, AgentStep, ChatStructuredPayload } from '@/domains/chat/types';

interface ChatMessageListProps {
  messages: ChatMessage[];
  loading: boolean;
  agentSteps: AgentStep[];
  isSessionLoading: boolean;
  isDragging: boolean;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  expandedEvidenceByMessageId: Record<string, boolean>;
  onToggleEvidence: (messageId: string) => void;
  feedbackSentByMessageId: Record<string, 'positive' | 'negative' | undefined>;
  onFeedback: (msg: ChatMessage, type: 'positive' | 'negative') => void;
  onRetry: (sourceUserText?: string) => void;
  onScenarioSelect: (label: string, routes?: Array<{ label: string; routeRequest: any }>) => void;
  onGenerateFile: (type: 'pdf', override?: { structured?: ChatStructuredPayload }) => void;
  isGeneratingFile: boolean;
  onPreviewRoute: (routeRequest: any) => void;
  /** 인라인 견적 카드의 "현황·발행 열기" — compact에서 견적 드로어를 연다. */
  onOpenQuotePanel?: () => void;
}

function renderMessageBody(msg: ChatMessage) {
  if (msg.role === 'user') {
    return <div className="whitespace-pre-wrap break-words">{msg.content}</div>;
  }
  return <ChatMarkdown content={msg.content} />;
}

interface MessageBubbleProps {
  msg: ChatMessage;
  loading: boolean;
  isEvidenceExpanded: boolean;
  feedback: 'positive' | 'negative' | undefined;
  onToggleEvidence: (messageId: string) => void;
  onFeedback: (msg: ChatMessage, type: 'positive' | 'negative') => void;
  onRetry: (sourceUserText?: string) => void;
  onScenarioSelect: (label: string, routes?: Array<{ label: string; routeRequest: any }>) => void;
  onGenerateFile: (type: 'pdf', override?: { structured?: ChatStructuredPayload }) => void;
  isGeneratingFile: boolean;
  onPreviewRoute: (routeRequest: any) => void;
  onOpenQuotePanel?: () => void;
}

/**
 * 단일 메시지 버블. memo로 감싸 스트리밍 토큰 갱신 시 마지막 버블만 재렌더되게 한다
 * (과거 메시지는 props 동일성으로 스킵).
 */
const MessageBubble = React.memo(function MessageBubble({
  msg,
  loading,
  isEvidenceExpanded,
  feedback,
  onToggleEvidence,
  onFeedback,
  onRetry,
  onScenarioSelect,
  onGenerateFile,
  isGeneratingFile,
  onPreviewRoute,
  onOpenQuotePanel,
}: MessageBubbleProps) {
  return (
    <div className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} ${msg.structured ? 'max-w-[95%] md:max-w-[88%]' : 'max-w-[85%] md:max-w-[75%]'}`}>

        {/* Avatar */}
        <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${msg.role === 'user'
          ? 'bg-secondary text-muted-foreground'
          : 'bg-primary/10 text-primary'
          }`}>
          {msg.role === 'user' ? <span className="text-xs font-bold">나</span> : <Sparkles className="h-4 w-4" />}
        </div>

        {/* Message Bubble */}
        <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
          <div
            className={`relative px-4 py-3 text-[14.5px] leading-relaxed ${msg.role === 'user'
              ? 'bg-primary text-primary-foreground rounded-2xl rounded-tr-md shadow-sm shadow-primary/20'
              : (msg.kind === 'system' && msg.content !== WELCOME_MESSAGE)
                ? 'bg-warning-muted text-warning border border-warning/20 rounded-2xl'
                : 'bg-card text-foreground border border-border rounded-2xl rounded-tl-md shadow-sm shadow-black/[0.03]'
              }`}
          >
            {renderMessageBody(msg)}
          </div>
          {msg.role === 'assistant' && msg.structured && (
            <div className="mt-3 w-full space-y-3">
              {msg.structured.scenarioComparison && (
                <>
                  <ScenarioComparisonCard
                    comparison={msg.structured.scenarioComparison}
                    routeErrors={msg.structured.scenarioRouteErrors}
                    realtimeTraffic={msg.structured.realtimeTraffic}
                    departureAt={msg.structured.departureAt}
                    onSelect={(r) => onScenarioSelect(r.label, msg.structured?.scenarioRoutes)}
                  />
                  <button
                    type="button"
                    onClick={() => onGenerateFile('pdf', { structured: msg.structured })}
                    disabled={isGeneratingFile}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 active:scale-[0.99] transition disabled:opacity-50"
                  >
                    {isGeneratingFile ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                    이 결과로 견적서 발행 (PDF)
                  </button>
                </>
              )}
              {msg.structured.departureMatrix && (
                <DepartureMatrixCard matrix={msg.structured.departureMatrix} />
              )}
              {msg.structured.auditTimeline && (
                <AuditTimelineCard audit={msg.structured.auditTimeline} />
              )}
              {msg.structured.caseBoard && (
                <CaseBoardCard board={msg.structured.caseBoard} onPreviewRoute={onPreviewRoute} />
              )}
              {!msg.structured.scenarioComparison && Boolean(msg.structured.quote) && (
                <QuoteResultCard quote={msg.structured.quote} onOpenPanel={onOpenQuotePanel} />
              )}
              {!msg.structured.scenarioComparison && !msg.structured.caseBoard && Boolean(msg.structured.routeRequest) && (
                <button
                  type="button"
                  onClick={() => onPreviewRoute(msg.structured?.routeRequest)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="견적서 발행이 아니라, 이 경로를 지도에 표시만 합니다."
                >
                  <MapIcon className="h-3.5 w-3.5" />
                  경로 미리보기
                </button>
              )}
            </div>
          )}
          {msg.role === 'assistant' && msg.retryable && msg.sourceUserText && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => onRetry(msg.sourceUserText)}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                다시 시도
              </button>
            </div>
          )}
          {shouldRenderEvidence(msg) && (
            <div className="mt-2 w-full max-w-[560px]">
              <button
                type="button"
                onClick={() => onToggleEvidence(msg.id)}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted"
              >
                <Sparkles className="w-3 h-3 text-primary" />
                근거/출처 보기
                <span className="text-muted-foreground">
                  ({(msg.evidence?.sources || []).length})
                </span>
              </button>
              {isEvidenceExpanded && (
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
                                  className="block truncate text-primary hover:underline"
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
                onClick={() => onFeedback(msg, 'positive')}
                disabled={!!feedback}
                className={`text-[10px] flex items-center gap-1 ${feedback === 'positive' ? 'text-primary font-bold' : 'text-muted-foreground hover:text-primary'} ${feedback && feedback !== 'positive' ? 'hidden' : ''}`}
              >
                <ThumbsUp className="w-3 h-3" /> 도움이 됐어요
              </button>
              {!feedback && <span className="text-muted-foreground text-[8px]">|</span>}
              <button
                type="button"
                onClick={() => onFeedback(msg, 'negative')}
                disabled={!!feedback}
                className={`text-[10px] flex items-center gap-1 ${feedback === 'negative' ? 'text-rose-600 font-bold' : 'text-muted-foreground hover:text-rose-600'} ${feedback && feedback !== 'negative' ? 'hidden' : ''}`}
              >
                <ThumbsDown className="w-3 h-3" /> 아쉬워요
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

/**
 * 대화 메시지 스크롤 영역. 메시지 버블, 구조화 결과 카드(시나리오/출발매트릭스/경로),
 * 근거·피드백 UI, 에이전트 진행 인디케이터, 파일 드롭존을 렌더한다.
 *
 * 스크롤 잠금: 사용자가 위로 스크롤해 과거 메시지를 읽는 중이면 스트리밍 토큰이 들어와도
 * 강제로 바닥으로 끌어내리지 않는다. 바닥 근처(임계 120px)일 때만 자동 추종한다.
 */
export default function ChatMessageList({
  messages,
  loading,
  agentSteps,
  isSessionLoading,
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  expandedEvidenceByMessageId,
  onToggleEvidence,
  feedbackSentByMessageId,
  onFeedback,
  onRetry,
  onScenarioSelect,
  onGenerateFile,
  isGeneratingFile,
  onPreviewRoute,
  onOpenQuotePanel,
}: ChatMessageListProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const nearBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const NEAR_BOTTOM_PX = 120;

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distanceFromBottom < NEAR_BOTTOM_PX;
    nearBottomRef.current = near;
    setShowJump(!near);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior) => {
    endRef.current?.scrollIntoView({ behavior });
  }, []);

  // 마운트(모달 오픈) 시 즉시 바닥으로
  useEffect(() => {
    scrollToBottom('auto');
    nearBottomRef.current = true;
    setShowJump(false);
  }, [scrollToBottom]);

  // 메시지/로딩 변화 시: 바닥 근처일 때만 추종. 스트리밍 중(loading)엔 부드러움 없이 즉시.
  useEffect(() => {
    if (nearBottomRef.current) {
      scrollToBottom(loading ? 'auto' : 'smooth');
    }
  }, [messages, loading, agentSteps, scrollToBottom]);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="relative flex-1 overflow-y-auto px-4 py-6 md:px-7 space-y-6 scroll-smooth custom-scrollbar bg-muted/40"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isSessionLoading && (
        <div className="sticky top-0 z-10 -mt-2 mb-1 flex items-center justify-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/90 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
            <Loader2 className="h-3 w-3 animate-spin" />
            이전 대화를 불러오는 중…
          </span>
        </div>
      )}
      {isDragging && (
        <div className="absolute inset-3 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 backdrop-blur-sm pointer-events-none">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Paperclip className="w-4 h-4" />
            여기에 파일을 놓으면 첨부됩니다
          </div>
        </div>
      )}
      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          msg={msg}
          loading={loading}
          isEvidenceExpanded={!!expandedEvidenceByMessageId[msg.id]}
          feedback={feedbackSentByMessageId[msg.id]}
          onToggleEvidence={onToggleEvidence}
          onFeedback={onFeedback}
          onRetry={onRetry}
          onScenarioSelect={onScenarioSelect}
          onGenerateFile={onGenerateFile}
          isGeneratingFile={isGeneratingFile}
          onPreviewRoute={onPreviewRoute}
          onOpenQuotePanel={onOpenQuotePanel}
        />
      ))}

      {loading && (
        <div className="flex justify-start w-full">
          <div className="flex items-start gap-3 max-w-[85%]">
            <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
            <div className="bg-card px-4 py-3 rounded-2xl rounded-tl-md border border-border shadow-sm shadow-black/[0.03]">
              {agentSteps.length === 0 ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">분석 중입니다...</span>
                  <span className="flex space-x-1">
                    <span className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce"></span>
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
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary flex-shrink-0" />
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
      <div ref={endRef} className="h-4" />

      {showJump && (
        <div className="sticky bottom-3 z-20 flex justify-center pointer-events-none">
          <button
            type="button"
            onClick={() => {
              nearBottomRef.current = true;
              setShowJump(false);
              scrollToBottom('smooth');
            }}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-card/95 px-3.5 py-1.5 text-xs font-semibold text-foreground shadow-md backdrop-blur-sm hover:bg-muted transition"
          >
            <ArrowDown className="h-3.5 w-3.5" />
            맨 아래로
          </button>
        </div>
      )}
    </div>
  );
}
