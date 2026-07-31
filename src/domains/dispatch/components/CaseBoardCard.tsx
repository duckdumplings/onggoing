'use client';

import React, { useEffect, useState } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import QuoteBookOverview from '@/domains/dispatch/components/QuoteBookOverview';
import type { CaseBoardResult } from '@/domains/dispatch/services/caseBoard';
import type { RoutePreviewHandler } from '@/domains/dispatch/types/routePreview';

interface CaseBoardCardProps {
  board: CaseBoardResult;
  onPreviewRoute: RoutePreviewHandler;
}

function won(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) return '미산정';
  return `₩${Math.round(value).toLocaleString('ko-KR')}`;
}

export default function CaseBoardCard({
  board,
  onPreviewRoute,
}: CaseBoardCardProps) {
  const cases = board.cases;
  const [selectedCaseId, setSelectedCaseId] = useState(() => cases[0]?.id ?? '');

  useEffect(() => {
    if (!cases.some((result) => result.id === selectedCaseId)) {
      setSelectedCaseId(cases[0]?.id ?? '');
    }
  }, [cases, selectedCaseId]);

  if (!cases.length) return null;

  const rollup = board.rollup;
  const quotePackage = board.quotePackage;
  const selectedCase =
    cases.find((result) => result.id === selectedCaseId) ?? cases[0];
  const hasOperatingBasis = Boolean(
    rollup.contractBreakdown?.length ||
      quotePackage?.operatingBasis?.length ||
      quotePackage?.groupRollups?.length,
  );

  return (
    <div className="glass-panel w-full p-3 sm:p-4">
      <QuoteBookOverview
        board={board}
        selectedCase={selectedCase}
        onSelect={setSelectedCaseId}
        onPreviewRoute={onPreviewRoute}
      />

      {hasOperatingBasis && (
        <details className="group mt-3 overflow-hidden rounded-xl border border-border bg-card">
          <summary className="focus-ring-inset flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-2.5 text-xs font-semibold text-foreground transition hover:bg-muted/60">
            <span className="inline-flex items-center gap-2">
              <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
              월 운영·권역 합계 근거
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>

          <div className="space-y-3 border-t border-border bg-muted/20 p-3">
            {Array.isArray(rollup.contractBreakdown) &&
              rollup.contractBreakdown.length > 0 && (
                <section aria-label="월별 영업일 반영">
                  <div className="mb-1.5 text-[10px] font-semibold text-muted-foreground">
                    월별 영업일 반영
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {rollup.contractBreakdown.map((month) => (
                      <span
                        key={month.month}
                        className="rounded-md border border-border bg-card px-2 py-1 text-[11px] tabular-nums text-foreground"
                      >
                        {month.month} · {won(month.total)}
                      </span>
                    ))}
                  </div>
                </section>
              )}

            {quotePackage?.operatingBasis?.length ? (
              <section aria-label="월 운영 기준">
                <div className="mb-1.5 text-[10px] font-semibold text-muted-foreground">
                  월 운영 기준
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {quotePackage.operatingBasis.map((basis) => (
                    <span
                      key={`${basis.weekdaysLabel ?? 'basis'}-${basis.monthlyVisits ?? 'n'}`}
                      className="rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground"
                    >
                      {basis.weekdaysLabel ?? '운영일'} · 월 {basis.monthlyVisits ?? '-'}회
                      {basis.includeHolidays === true
                        ? ' · 공휴일 포함'
                        : basis.includeHolidays === false
                          ? ' · 공휴일 제외'
                          : ''}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            {quotePackage?.groupRollups?.length ? (
              <section
                className="overflow-hidden rounded-lg border border-border bg-card"
                aria-label="권역별 월 견적"
              >
                <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-b border-border bg-muted px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground">
                  <span>권역</span>
                  <span className="text-right">월 견적</span>
                  <span className="text-right">상태</span>
                </div>
                {quotePackage.groupRollups.map((group) => (
                  <div
                    key={group.group}
                    className="grid grid-cols-[1fr_auto_auto] gap-2 border-b border-border px-2.5 py-2 text-[11px] last:border-b-0"
                  >
                    <span className="truncate font-medium text-foreground">
                      {group.group}
                    </span>
                    <span className="text-right tabular-nums text-foreground">
                      {won(group.monthlyTotal)}
                    </span>
                    <span className="text-right text-muted-foreground">
                      {group.riskLabel}
                    </span>
                  </div>
                ))}
              </section>
            ) : null}
          </div>
        </details>
      )}

      <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
        {board.basis}
      </p>
    </div>
  );
}
