'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownNarrowWide,
  BookOpen,
  CheckCircle2,
  CircleX,
} from 'lucide-react';
import QuoteBookCaseDetail from '@/domains/dispatch/components/QuoteBookCaseDetail';
import type {
  CaseBoardCaseResult,
  CaseBoardResult,
} from '@/domains/dispatch/services/caseBoard';
import {
  countQuoteBookStatuses,
  filterQuoteBookCases,
  getQuoteBookStatus,
  getQuoteBookStatusLabel,
  sortQuoteBookCases,
  type QuoteBookFilter,
  type QuoteBookStatus,
} from '@/domains/dispatch/services/quoteBookPresentation';
import type { RoutePreviewHandler } from '@/domains/dispatch/types/routePreview';

interface QuoteBookOverviewProps {
  board: CaseBoardResult;
  selectedCase: CaseBoardCaseResult;
  onSelect: (caseId: string) => void;
  onPreviewRoute: RoutePreviewHandler;
}

const STATUS_META: Record<
  QuoteBookStatus,
  { className: string; textClassName: string }
> = {
  complete: {
    className: 'bg-success-muted text-success-600',
    textClassName: 'text-success-600',
  },
  attention: {
    className: 'bg-warning-muted text-warning',
    textClassName: 'text-warning',
  },
  blocked: {
    className: 'bg-error-muted text-error-600',
    textClassName: 'text-error-600',
  },
};

function won(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) return '미산정';
  return `₩${Math.round(value).toLocaleString('ko-KR')}`;
}

function StatusIcon({ status }: { status: QuoteBookStatus }) {
  if (status === 'complete') return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (status === 'attention') return <AlertTriangle className="h-3.5 w-3.5" />;
  return <CircleX className="h-3.5 w-3.5" />;
}

function caseTimingLabel(result: CaseBoardCaseResult): string {
  if (result.error) return '조건 수정 필요';
  const departure = result.departureWasSuggested
    ? `권장 상차 ${result.pickupStartLabel ?? '-'}`
    : `출발 ${result.departureLabel ?? '-'}`;
  if (result.deadlineSlackMinutes == null) return departure;
  if (result.deadlineSlackMinutes < 0) {
    return `${departure} · ${Math.abs(result.deadlineSlackMinutes)}분 초과`;
  }
  return `${departure} · 여유 ${result.deadlineSlackMinutes}분`;
}

export default function QuoteBookOverview({
  board,
  selectedCase,
  onSelect,
  onPreviewRoute,
}: QuoteBookOverviewProps) {
  const cases = board.cases;
  const [filter, setFilter] = useState<QuoteBookFilter>('all');
  const sortedCases = useMemo(() => sortQuoteBookCases(cases), [cases]);
  const visibleCases = useMemo(
    () => filterQuoteBookCases(sortedCases, filter),
    [filter, sortedCases],
  );
  const counts = useMemo(() => countQuoteBookStatuses(cases), [cases]);
  const originalOrder = useMemo(
    () => new Map(cases.map((result, index) => [result.id, index + 1])),
    [cases],
  );
  const rollup = board.rollup;
  const attentionCount = counts.attention + counts.blocked;

  const selectFilter = (nextFilter: QuoteBookFilter) => {
    setFilter(nextFilter);
    const nextCases = filterQuoteBookCases(sortedCases, nextFilter);
    if (
      nextCases.length > 0 &&
      !nextCases.some((result) => result.id === selectedCase.id)
    ) {
      onSelect(nextCases[0].id);
    }
  };

  return (
    <section
      className="overflow-hidden rounded-xl border border-border bg-card"
      aria-label="다중 라인 견적책"
    >
      <header className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-sm font-bold text-foreground">
            <BookOpen className="h-4 w-4 text-primary" />
            다중 라인 견적책
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            확인이 필요한 라인을 먼저 배치했어요. 라인을 선택하면 경로와 운임 근거가
            한 화면에서 바뀝니다.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 self-start rounded-lg bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground sm:self-auto">
          <ArrowDownNarrowWide className="h-3.5 w-3.5" />
          우선 확인순
        </div>
      </header>

      <div className="grid grid-cols-2 border-b border-border">
        <SummaryCell label="1회 합계" value={won(rollup.oneTimeTotal)} />
        <SummaryCell
          label={rollup.targetMonth ? `${rollup.targetMonth} 월 합계` : '월 합계'}
          value={won(rollup.monthlyTotal)}
        />
        <SummaryCell
          label={rollup.contractMonths ? `계약 ${rollup.contractMonths}개월` : '계약 합계'}
          value={won(rollup.contractTotal)}
        />
        <SummaryCell label="연 합계" value={won(rollup.annualTotal)} />
      </div>

      <div className="grid min-h-[480px] 2xl:grid-cols-[260px_minmax(0,1fr)]">
        <nav
          className="border-b border-border bg-muted/30 p-2.5 2xl:border-b-0 2xl:border-r"
          aria-label="견적 라인 선택"
        >
          <div className="mb-2 grid grid-cols-3 gap-1" role="group" aria-label="라인 상태 필터">
            <FilterButton
              active={filter === 'all'}
              label="전체"
              count={cases.length}
              onClick={() => selectFilter('all')}
            />
            <FilterButton
              active={filter === 'attention'}
              label="확인"
              count={attentionCount}
              tone={attentionCount > 0 ? 'attention' : undefined}
              onClick={() => selectFilter('attention')}
            />
            <FilterButton
              active={filter === 'complete'}
              label="완료"
              count={counts.complete}
              onClick={() => selectFilter('complete')}
            />
          </div>

          {visibleCases.length > 0 ? (
            <div className="flex gap-1.5 overflow-x-auto pb-1 2xl:max-h-[590px] 2xl:block 2xl:space-y-1 2xl:overflow-y-auto 2xl:overflow-x-hidden 2xl:pb-0 2xl:pr-1 custom-scrollbar">
              {visibleCases.map((result) => {
                const status = getQuoteBookStatus(result);
                const active = result.id === selectedCase.id;
                const order = originalOrder.get(result.id) ?? 0;
                return (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => onSelect(result.id)}
                    aria-pressed={active}
                    className={`focus-ring-inset min-h-[68px] min-w-[210px] rounded-lg border px-2.5 py-2 text-left transition 2xl:w-full 2xl:min-w-0 ${
                      active
                        ? 'border-primary/40 bg-card shadow-sm'
                        : 'border-transparent hover:border-border hover:bg-card/70'
                    }`}
                  >
                    <span className="flex items-start gap-2">
                      <span
                        className={`mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-md text-[10px] font-bold tabular-nums ${
                          active
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {order}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
                            {result.label}
                          </span>
                          <span className="flex-none text-[10px] font-bold tabular-nums text-foreground">
                            {won(result.oneTimePrice)}
                          </span>
                        </span>
                        <span
                          className={`mt-1 inline-flex items-center gap-1 text-[10px] font-semibold ${STATUS_META[status].textClassName}`}
                        >
                          <StatusIcon status={status} />
                          {getQuoteBookStatusLabel(result)}
                        </span>
                        <span
                          className="mt-0.5 block truncate text-[10px] text-muted-foreground"
                          title={caseTimingLabel(result)}
                        >
                          {caseTimingLabel(result)}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-[160px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/60 px-3 text-center">
              <CheckCircle2 className="h-5 w-5 text-success-600" />
              <p className="mt-2 text-xs font-semibold text-foreground">
                해당 상태의 라인이 없어요
              </p>
              <button
                type="button"
                onClick={() => selectFilter('all')}
                className="focus-ring-inset mt-2 min-h-9 rounded-md px-2.5 text-[11px] font-semibold text-primary hover:bg-primary/5"
              >
                전체 라인 보기
              </button>
            </div>
          )}
        </nav>

        <div className="min-w-0 p-3">
          <QuoteBookCaseDetail
            result={selectedCase}
            onPreviewRoute={onPreviewRoute}
          />
        </div>
      </div>
    </section>
  );
}

function FilterButton({
  active,
  label,
  count,
  tone,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  tone?: 'attention';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`focus-ring-inset flex min-h-11 items-center justify-center gap-1 rounded-md px-1.5 text-[10px] font-semibold transition ${
        active
          ? 'bg-card text-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-card/60 hover:text-foreground'
      }`}
    >
      <span>{label}</span>
      <span
        className={`rounded-full px-1.5 py-0.5 tabular-nums ${
          tone === 'attention' && count > 0
            ? 'bg-warning-muted text-warning'
            : 'bg-muted text-muted-foreground'
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  const missing = value === '미산정';
  return (
    <div className="border-r border-t border-border px-3 py-2.5 even:border-r-0 [&:nth-child(-n+2)]:border-t-0">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div
        className={`mt-0.5 text-sm font-bold tabular-nums ${
          missing ? 'text-muted-foreground' : 'text-foreground'
        }`}
      >
        {value}
      </div>
    </div>
  );
}
