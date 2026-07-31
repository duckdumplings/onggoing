'use client';

import React from 'react';
import { Archive, ChevronDown, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import type { ChatSession, ChatAttachment } from '@/domains/chat/types';
import type { SavedQuoteSummary } from '@/domains/quote/types/savedQuote';

interface ManageSectionProps {
  sessions: ChatSession[];
  currentSessionId: string | null;
  isSessionLoading: boolean;
  sessionPersistenceEnabled: boolean;
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  attachments: ChatAttachment[];
  savedQuotes: SavedQuoteSummary[];
  isSavedQuoteListLoading: boolean;
  isSavedQuoteDetailLoading: boolean;
  savedQuoteMessage: string | null;
  onRefreshSavedQuotes: () => void;
  onOpenSavedQuote: (id: string) => void;
}

function Accordion({
  title,
  count,
  action,
  defaultOpen = true,
  children,
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground"
          aria-expanded={open}
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? '' : '-rotate-90'}`} />
          {title}
          {typeof count === 'number' && <span className="text-[10px] font-medium text-muted-foreground/70">({count})</span>}
        </button>
        {action}
      </div>
      {open && <div className="animate-in fade-in duration-200">{children}</div>}
    </div>
  );
}

/** 관리 탭 본문: 대화방 + 첨부 파일(아코디언). */
export default function ManageSection({
  sessions,
  currentSessionId,
  isSessionLoading,
  sessionPersistenceEnabled,
  onNewSession,
  onSelectSession,
  onDeleteSession,
  attachments,
  savedQuotes,
  isSavedQuoteListLoading,
  isSavedQuoteDetailLoading,
  savedQuoteMessage,
  onRefreshSavedQuotes,
  onOpenSavedQuote,
}: ManageSectionProps) {
  return (
    <div className="space-y-6">
      <Accordion
        title="견적 기록"
        count={savedQuotes.length}
        action={
          <button
            type="button"
            onClick={onRefreshSavedQuotes}
            disabled={isSavedQuoteListLoading}
            className="focus-ring inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${isSavedQuoteListLoading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        }
      >
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-border bg-card p-2 shadow-sm">
          {savedQuotes.map((quote) => (
            <button
              key={quote.id}
              type="button"
              onClick={() => onOpenSavedQuote(quote.id)}
              disabled={isSavedQuoteDetailLoading}
              className="focus-ring w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted disabled:opacity-60"
            >
              <div className="flex items-start gap-2">
                <Archive className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-foreground">{quote.title}</div>
                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                    <span className="font-semibold tabular-nums text-foreground">
                      ₩{Math.round(quote.totalAmount).toLocaleString('ko-KR')}
                    </span>
                    <span>{quote.caseCount}개 라인</span>
                    <span>
                      {new Date(quote.createdAt).toLocaleDateString('ko-KR', {
                        month: '2-digit',
                        day: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
                {isSavedQuoteDetailLoading && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
              </div>
            </button>
          ))}
          {!savedQuotes.length && !isSavedQuoteListLoading && (
            <div className="px-2 py-3 text-[11px] leading-relaxed text-muted-foreground">
              저장된 견적이 없어요. 계산이 끝난 견적책에서 ‘견적 기록에 저장’을 누르면 여기에 쌓입니다.
            </div>
          )}
          {isSavedQuoteListLoading && !savedQuotes.length && (
            <div className="flex items-center gap-2 px-2 py-3 text-[11px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              견적 기록을 불러오는 중...
            </div>
          )}
        </div>
        {savedQuoteMessage && (
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground" role="status">
            {savedQuoteMessage}
          </p>
        )}
      </Accordion>

      <Accordion
        title="대화방"
        count={sessions.length}
        action={
          <button onClick={onNewSession} className="text-[11px] font-semibold text-primary hover:text-primary/80">
            + 새 대화
          </button>
        }
      >
        <div className="space-y-2">
          <div className="bg-card rounded-xl border border-border p-2 shadow-sm max-h-48 overflow-y-auto space-y-1">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`w-full text-left px-2 py-2 rounded-lg transition-colors ${currentSessionId === session.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-foreground'
                  }`}
              >
                <button onClick={() => onSelectSession(session.id)} className="w-full text-left px-1">
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
                      onDeleteSession(session.id);
                    }}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-error hover:bg-error-muted"
                  >
                    <Trash2 className="w-3 h-3" />
                    삭제
                  </button>
                </div>
              </div>
            ))}
            {!sessions.length && <div className="px-2 py-2 text-[11px] text-muted-foreground">저장된 대화가 없어요.</div>}
          </div>
          {isSessionLoading && <div className="text-[11px] text-muted-foreground">대화를 불러오는 중...</div>}
          {!sessionPersistenceEnabled && (
            <div className="text-[11px] text-warning bg-warning-muted border border-warning/30 rounded-lg px-2 py-1.5">
              서버 대화 저장이 비활성화되어 로컬 임시 대화로 동작 중입니다.
            </div>
          )}
        </div>
      </Accordion>

      <Accordion title="첨부 파일" count={attachments.length}>
        <div className="bg-card rounded-xl border border-border p-2 shadow-sm max-h-40 overflow-y-auto space-y-1">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="px-2 py-1.5 rounded-lg border border-border bg-muted">
              <div className="text-[11px] font-semibold text-foreground truncate">{attachment.file_name}</div>
              <div className="text-[10px] text-muted-foreground">
                {attachment.file_type} · {(attachment.file_size / 1024).toFixed(1)}KB · {attachment.parse_status}
              </div>
            </div>
          ))}
          {!attachments.length && <div className="px-2 py-2 text-[11px] text-muted-foreground">첨부된 파일이 없어요.</div>}
        </div>
      </Accordion>
    </div>
  );
}
