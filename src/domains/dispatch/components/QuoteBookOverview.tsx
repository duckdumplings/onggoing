'use client';

import React from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  CircleX,
  Clock3,
  Map as MapIcon,
  Route,
} from 'lucide-react';
import CaseRouteSchematic from '@/domains/dispatch/components/CaseRouteSchematic';
import type {
  CaseBoardCaseResult,
  CaseBoardResult,
  DeadlineRiskGrade,
} from '@/domains/dispatch/services/caseBoard';

interface QuoteBookOverviewProps {
  board: CaseBoardResult;
  selectedCase: CaseBoardCaseResult;
  onSelect: (caseId: string) => void;
  onPreviewRoute: (routeRequest: unknown) => void;
}

type StatusTone = 'complete' | 'attention' | 'blocked';

const STATUS_META: Record<StatusTone, { label: string; className: string; textClassName: string }> = {
  complete: {
    label: '산출 완료',
    className: 'bg-success-muted text-success-600',
    textClassName: 'text-success-600',
  },
  attention: {
    label: '확인 필요',
    className: 'bg-warning-muted text-warning',
    textClassName: 'text-warning',
  },
  blocked: {
    label: '마감/오류',
    className: 'bg-error-muted text-error-600',
    textClassName: 'text-error-600',
  },
};

function won(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) return '미산정';
  return `₩${Math.round(value).toLocaleString('ko-KR')}`;
}

function caseStatus(result: CaseBoardCaseResult): StatusTone {
  if (result.error || result.riskGrade === 'infeasible') return 'blocked';
  if (['caution', 'danger', 'recheck'].includes(result.riskGrade ?? '')) return 'attention';
  return 'complete';
}

function caseStatusLabel(result: CaseBoardCaseResult): string {
  if (result.error) return '계산 오류';
  if (result.riskGrade === 'infeasible') return '마감 초과';
  return STATUS_META[caseStatus(result)].label;
}

function riskLabel(grade?: DeadlineRiskGrade): string {
  const labels: Record<DeadlineRiskGrade, string> = {
    safe: '마감 안정',
    caution: '마감 주의',
    danger: '여유 부족',
    recheck: '구조 재검토',
    infeasible: '마감 초과',
    none: '마감 없음',
  };
  return labels[grade ?? 'none'];
}

function StatusIcon({ status }: { status: StatusTone }) {
  if (status === 'complete') return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (status === 'attention') return <AlertTriangle className="h-3.5 w-3.5" />;
  return <CircleX className="h-3.5 w-3.5" />;
}

export default function QuoteBookOverview({
  board,
  selectedCase,
  onSelect,
  onPreviewRoute,
}: QuoteBookOverviewProps) {
  const cases = board.cases ?? [];
  const counts = cases.reduce(
    (acc, result) => {
      acc[caseStatus(result)] += 1;
      return acc;
    },
    { complete: 0, attention: 0, blocked: 0 },
  );
  const selectedStatus = caseStatus(selectedCase);
  const selectedMeta = STATUS_META[selectedStatus];
  const rollup = board.rollup;

  return (
    <section className="mb-4 overflow-hidden rounded-xl border border-border bg-card" aria-label="다중 라인 견적책 요약">
      <header className="flex flex-col gap-3 border-b border-border px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-sm font-bold text-foreground">
            <BookOpen className="h-4 w-4 text-primary" />
            다중 라인 견적책
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            전체 금액과 운행 가능 여부를 먼저 보고, 라인을 선택해 경로와 계산 근거를 확인하세요.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold">
          <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">전체 {cases.length}</span>
          <span className={STATUS_META.complete.className + ' rounded-full px-2 py-1'}>완료 {counts.complete}</span>
          <span className={STATUS_META.attention.className + ' rounded-full px-2 py-1'}>확인 {counts.attention}</span>
          <span className={STATUS_META.blocked.className + ' rounded-full px-2 py-1'}>마감/오류 {counts.blocked}</span>
        </div>
      </header>

      <div className="grid grid-cols-2 border-b border-border sm:grid-cols-4">
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

      <div className="grid lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="border-b border-border p-2 lg:border-b-0 lg:border-r" aria-label="견적 라인 선택">
          <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            라인 목록
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
            {cases.map((result, index) => {
              const status = caseStatus(result);
              const active = result.id === selectedCase.id;
              return (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => onSelect(result.id)}
                  aria-pressed={active}
                  className={`min-w-[180px] rounded-lg border px-2.5 py-2 text-left transition lg:min-w-0 lg:w-full ${
                    active
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-transparent hover:border-border hover:bg-muted'
                  }`}
                >
                  <span className="flex items-start gap-2">
                    <span className="mt-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-foreground">{result.label}</span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className={`inline-flex items-center gap-1 text-[10px] ${STATUS_META[status].textClassName}`}>
                          <StatusIcon status={status} />
                          {caseStatusLabel(result)}
                        </span>
                        <span className="text-[10px] font-semibold tabular-nums text-foreground">
                          {won(result.oneTimePrice)}
                        </span>
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="min-w-0 p-3">
          <div className="mb-2.5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="truncate text-base font-bold text-foreground">{selectedCase.label}</h3>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${selectedMeta.className}`}>
                  <StatusIcon status={selectedStatus} />
                  {caseStatusLabel(selectedCase)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Clock3 className="h-3 w-3" />
                  출발 {selectedCase.departureLabel ?? '미지정'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Route className="h-3 w-3" />
                  {selectedCase.km != null ? `${selectedCase.km}km` : '거리 미산정'} · {selectedCase.driveMinutes ?? '-'}분 주행
                </span>
                <span>{riskLabel(selectedCase.riskGrade)}</span>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <div className="text-lg font-bold tabular-nums text-foreground">{won(selectedCase.oneTimePrice)}</div>
              <div className="text-[10px] text-muted-foreground">시간당 운임 · 1회</div>
            </div>
          </div>

          <CaseRouteSchematic
            points={selectedCase.schematic}
            polyline={selectedCase.routeGeometry}
            className="h-[160px] sm:h-[190px]"
          />

          <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {selectedCase.error
                ? selectedCase.error
                : selectedCase.riskReason ?? `배송 ${selectedCase.deliveryArrival ?? '-'} · 반납 ${selectedCase.returnArrival ?? '없음'}`}
            </p>
            {Boolean(selectedCase.routeRequest) && (
              <button
                type="button"
                onClick={() => onPreviewRoute(selectedCase.routeRequest)}
                className="inline-flex flex-shrink-0 items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
              >
                <MapIcon className="h-3.5 w-3.5" />
                선택 라인 지도 열기
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-t border-border px-3 py-2.5 even:border-r-0 [&:nth-child(-n+2)]:border-t-0 sm:border-t-0 sm:even:border-r sm:last:border-r-0">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-bold tabular-nums text-foreground">{value}</div>
    </div>
  );
}
