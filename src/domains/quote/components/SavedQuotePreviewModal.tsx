'use client';

import React, { useEffect } from 'react';
import { CalendarDays, Database, X } from 'lucide-react';

import CaseBoardCard from '@/domains/dispatch/components/CaseBoardCard';
import type { RoutePreviewHandler } from '@/domains/dispatch/types/routePreview';
import type { SavedQuoteDetail } from '@/domains/quote/types/savedQuote';

interface SavedQuotePreviewModalProps {
  quote: SavedQuoteDetail;
  onClose: () => void;
  onPreviewRoute: RoutePreviewHandler;
}

function won(value: number): string {
  return `₩${Math.round(value).toLocaleString('ko-KR')}`;
}

export default function SavedQuotePreviewModal({
  quote,
  onClose,
  onPreviewRoute,
}: SavedQuotePreviewModalProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="saved-quote-title"
      className="fixed inset-0 z-[4200] flex items-center justify-center glass-overlay p-3 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-muted-foreground">저장된 견적책</p>
            <h2 id="saved-quote-title" className="truncate text-base font-bold text-foreground">
              {quote.title}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span className="font-semibold tabular-nums text-foreground">{won(quote.totalAmount)}</span>
              <span>{quote.caseCount}개 라인</span>
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                {new Date(quote.createdAt).toLocaleString('ko-KR')}
              </span>
              {quote.rateEffectiveFrom && (
                <span className="inline-flex items-center gap-1">
                  <Database className="h-3 w-3" />
                  운임 시행 {quote.rateEffectiveFrom}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="저장 견적 닫기"
            className="focus-ring inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30 p-3 custom-scrollbar sm:p-5">
          <CaseBoardCard board={quote.quoteBook} onPreviewRoute={onPreviewRoute} />
        </div>
      </div>
    </div>
  );
}
