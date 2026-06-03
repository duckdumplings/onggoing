'use client';

import React from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import SingleQuoteInsights from '@/domains/dispatch/components/SingleQuoteInsights';
import type { AIQuoteResponse } from '@/domains/chat/types';

type Quote = NonNullable<AIQuoteResponse['quote']>;

interface QuoteHeroCardProps {
  quote: Quote;
  previewMode: 'input-order' | 'optimized-order';
  setPreviewMode: React.Dispatch<React.SetStateAction<'input-order' | 'optimized-order'>>;
  isPreviewLoading: boolean;
  previewError: string | null;
  onPreviewOnMap: (useSanitizedFallback?: boolean) => void;
  onOpenQuoteDetail: () => void;
}

/** 견적 결과 하이라이트 카드(시간당/단건 헤드라인 + 미리보기 액션 + 인사이트). */
export default function QuoteHeroCard({
  quote,
  previewMode,
  setPreviewMode,
  isPreviewLoading,
  previewError,
  onPreviewOnMap,
  onOpenQuoteDetail,
}: QuoteHeroCardProps) {
  return (
    <div className="space-y-3">
      <div className="text-xs font-bold text-muted-foreground flex items-center justify-between">
        <span>예상 견적</span>
        <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium normal-case">
          기준: {quote.basis?.vehicleType} · {quote.basis?.scheduleType === 'regular' ? '정기' : '비정기'}
        </span>
      </div>
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-4">
        <div className="grid grid-cols-2 divide-x divide-border">
          <div className="pr-3">
            <div className="text-[10px] font-semibold text-muted-foreground mb-0.5">시간당 1회</div>
            <div className="text-xl font-black tracking-tight text-primary tabular-nums">{quote.hourly?.formatted}</div>
            {quote.hourly?.tiers && (
              <div className="mt-1.5 space-y-0.5 text-[10px] text-muted-foreground leading-tight tabular-nums">
                <div>일일 <span className="font-semibold text-foreground">{quote.hourly.tiers.perDay?.formatted}</span></div>
                <div>20일 <span className="font-semibold text-foreground">{quote.hourly.tiers.perMonth20d?.formatted}</span></div>
                <div className="text-muted-foreground/70 text-[9px]">유류할증 제외 · 운임표 기준</div>
              </div>
            )}
          </div>
          <div className="pl-3">
            <div className="text-[10px] font-semibold text-muted-foreground mb-0.5">단건 요금제</div>
            <div className="text-xl font-black tracking-tight text-foreground tabular-nums">{quote.perJob?.formatted}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-muted p-2">
            <div className="text-[10px] text-muted-foreground">운행 거리</div>
            <div className="text-sm font-bold text-foreground tabular-nums">{quote.basis?.distanceKm}km</div>
          </div>
          <div className="rounded-lg bg-muted p-2">
            <div className="text-[10px] text-muted-foreground">총 소요 시간</div>
            <div className="text-sm font-bold text-foreground tabular-nums">
              {quote.basis?.totalBillMinutes}분
              <div className="text-[9px] font-normal text-muted-foreground mt-0.5">
                운행 {quote.basis?.driveMinutes}분 + 체류 {quote.basis?.dwellTotalMinutes}분
              </div>
            </div>
          </div>
        </div>

        {quote.hourly?.advisor?.message && (
          <div className="rounded-lg bg-warning-muted border border-warning/30 px-3 py-2 text-[11px] leading-snug text-warning">
            <span className="font-semibold">단가 인하 구간 안내</span>
            <span className="block mt-0.5">
              {String(quote.hourly.advisor.message).replace(/^\s*[^\w가-힣₩(]+\s*/u, '')}
            </span>
          </div>
        )}

        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            <button
              type="button"
              onClick={() => setPreviewMode('input-order')}
              className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none ${previewMode === 'input-order' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              입력순
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode('optimized-order')}
              className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none ${previewMode === 'optimized-order' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              최적화순
            </button>
          </div>
          <button
            onClick={() => onPreviewOnMap(false)}
            disabled={isPreviewLoading}
            className="w-full bg-primary text-primary-foreground py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isPreviewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
            {isPreviewLoading ? '지도 반영 중...' : '지도에서 경로 확인하기'}
          </button>
          {previewError && (
            <div className="rounded-lg border border-error/30 bg-error-muted px-3 py-2 text-[11px] text-error space-y-2">
              <div>{previewError}</div>
              <button
                type="button"
                onClick={() => onPreviewOnMap(true)}
                disabled={isPreviewLoading}
                className="inline-flex items-center gap-1 rounded-md border border-error/40 bg-card px-2 py-1 text-[10px] font-semibold text-error hover:bg-error-muted disabled:opacity-60"
              >
                <Loader2 className={`w-3 h-3 ${isPreviewLoading ? 'animate-spin' : ''}`} />
                자동 수정으로 재시도
              </button>
            </div>
          )}
          <button
            onClick={onOpenQuoteDetail}
            className="w-full border border-border bg-card text-foreground py-2.5 rounded-xl text-sm font-semibold hover:border-primary/40 hover:text-primary transition-colors"
          >
            전체 운임 시나리오 비교
          </button>
        </div>
      </div>

      <SingleQuoteInsights
        vehicleType={quote.basis?.vehicleType}
        distanceKm={quote.basis?.distanceKm}
        driveMinutes={quote.basis?.driveMinutes}
        dwellMinutes={quote.basis?.dwellTotalMinutes}
        fuelPricePerLiter={quote.costReference?.fuelPricePerLiter}
        estimatedToll={quote.costReference?.estimatedToll}
        tollSource={quote.costReference?.tollSource}
      />
    </div>
  );
}
