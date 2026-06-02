'use client';

import React from 'react';
import { Calculator, Truck, MapPin, Clock, ArrowRight } from 'lucide-react';

interface QuoteResultCardProps {
  quote: any;
  /** "상세·발행" CTA. 없으면 버튼을 숨긴다(사이드바가 상시 보이는 데스크톱 등). */
  onOpenPanel?: () => void;
}

/**
 * 채팅 본문 인라인 견적 요약 카드. 헤드라인(시간당/단건)과 운행 근거만 컴팩트하게 보여 주고,
 * 상세·발행은 견적 현황 패널로 위임한다(역할 분리). 시맨틱 토큰만 사용, 노이모지.
 */
export default function QuoteResultCard({ quote, onOpenPanel }: QuoteResultCardProps) {
  if (!quote) return null;
  const basis = quote.basis ?? {};
  const scheduleLabel = basis.scheduleType === 'regular' ? '정기' : '비정기';
  const perDay = quote.hourly?.tiers?.perDay?.formatted;
  const perMonth = quote.hourly?.tiers?.perMonth20d?.formatted;
  const advisor = quote.hourly?.advisor?.message;

  return (
    <div className="glass-panel p-4 w-full space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-foreground inline-flex items-center gap-1.5">
          <Calculator className="h-4 w-4 text-muted-foreground" />
          예상 견적
        </div>
        {(basis.vehicleType || basis.scheduleType) && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            <Truck className="h-3 w-3" />
            {basis.vehicleType ?? '-'} · {scheduleLabel}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border bg-card p-2.5">
          <div className="text-[11px] text-muted-foreground">시간당 1회</div>
          <div className="text-base font-bold text-primary tabular-nums">{quote.hourly?.formatted ?? '-'}</div>
          {(perDay || perMonth) && (
            <div className="mt-1 space-y-0.5 text-[10px] text-muted-foreground tabular-nums">
              {perDay && <div>일일 {perDay}</div>}
              {perMonth && <div>20일 {perMonth}</div>}
            </div>
          )}
        </div>
        <div className="rounded-lg border border-border bg-card p-2.5">
          <div className="text-[11px] text-muted-foreground">단건 요금제</div>
          <div className="text-base font-bold text-foreground tabular-nums">{quote.perJob?.formatted ?? '-'}</div>
        </div>
      </div>

      {(basis.distanceKm != null || basis.totalBillMinutes != null) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground tabular-nums">
          {basis.distanceKm != null && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {basis.distanceKm}km
            </span>
          )}
          {basis.totalBillMinutes != null && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              총 {basis.totalBillMinutes}분
              {(basis.driveMinutes != null || basis.dwellTotalMinutes != null) && (
                <span className="text-muted-foreground/70">
                  (운행 {basis.driveMinutes ?? 0}분 + 체류 {basis.dwellTotalMinutes ?? 0}분)
                </span>
              )}
            </span>
          )}
        </div>
      )}

      {advisor && (
        <div className="rounded-lg bg-warning-muted px-3 py-2 text-[11px] leading-snug text-warning">
          <span className="font-semibold">단가 인하 구간 안내</span>
          <span className="mt-0.5 block">{String(advisor).replace(/^\s*[^\w가-힣₩(]+\s*/u, '')}</span>
        </div>
      )}

      {onOpenPanel && (
        <button
          type="button"
          onClick={onOpenPanel}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5 transition-colors"
        >
          견적 현황·발행 열기
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
