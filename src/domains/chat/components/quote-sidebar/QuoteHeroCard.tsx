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
      <div className="bg-primary rounded-2xl p-5 text-primary-foreground shadow-xl">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-primary-foreground/70 text-[10px] font-bold uppercase tracking-wider mb-1">시간당 1회</div>
            <div className="text-xl font-black tracking-tight">{quote.hourly?.formatted}</div>
            {quote.hourly?.tiers && (
              <div className="mt-1.5 space-y-0.5 text-[10px] text-primary-foreground/80 leading-tight">
                <div>
                  일일 <span className="font-semibold text-primary-foreground">{quote.hourly.tiers.perDay?.formatted}</span>
                </div>
                <div>
                  20일 <span className="font-semibold text-primary-foreground">{quote.hourly.tiers.perMonth20d?.formatted}</span>
                </div>
                <div className="text-primary-foreground/60 text-[9px]">유류할증 제외 · 운임표 기준</div>
              </div>
            )}
          </div>
          <div className="w-px self-stretch bg-primary-foreground/25 mx-3"></div>
          <div className="text-right">
            <div className="text-primary-foreground/70 text-[10px] font-bold uppercase tracking-wider mb-1">단건 요금제</div>
            <div className="text-xl font-black tracking-tight">{quote.perJob?.formatted}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-primary-foreground/10 rounded-lg p-2">
            <div className="text-[10px] text-primary-foreground/70">운행 거리</div>
            <div className="text-sm font-bold">{quote.basis?.distanceKm}km</div>
          </div>
          <div className="bg-primary-foreground/10 rounded-lg p-2">
            <div className="text-[10px] text-primary-foreground/70">총 소요 시간</div>
            <div className="text-sm font-bold">
              {quote.basis?.totalBillMinutes}분
              <div className="text-[9px] font-normal text-primary-foreground/70 mt-0.5">
                운행 {quote.basis?.driveMinutes}분 + 체류 {quote.basis?.dwellTotalMinutes}분
              </div>
            </div>
          </div>
        </div>

        {quote.hourly?.advisor?.message && (
          <div className="mb-4 rounded-lg bg-warning-muted border border-warning/30 px-3 py-2 text-[11px] leading-snug text-warning shadow-sm">
            <span className="font-semibold">단가 인하 구간 안내</span>
            <span className="block mt-0.5">
              {String(quote.hourly.advisor.message).replace(/^\s*[^\w가-힣₩(]+\s*/u, '')}
            </span>
          </div>
        )}

        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPreviewMode('input-order')}
              className={`rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors ${previewMode === 'input-order'
                ? 'bg-card text-primary border-card'
                : 'bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20 hover:bg-primary-foreground/20'
                }`}
            >
              입력순 미리보기
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode('optimized-order')}
              className={`rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors ${previewMode === 'optimized-order'
                ? 'bg-card text-primary border-card'
                : 'bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20 hover:bg-primary-foreground/20'
                }`}
            >
              최적화순 미리보기
            </button>
          </div>
          <button
            onClick={() => onPreviewOnMap(false)}
            disabled={isPreviewLoading}
            className="w-full bg-card text-primary py-3 rounded-xl text-sm font-bold hover:bg-card/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
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
            className="w-full bg-primary-foreground/15 text-primary-foreground py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-foreground/25 transition-colors"
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
      />
    </div>
  );
}
