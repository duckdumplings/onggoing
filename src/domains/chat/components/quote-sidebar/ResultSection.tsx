'use client';

import React from 'react';
import { MapPin, Truck, Clock, Calculator, Loader2, FileText, Check, ChevronDown } from 'lucide-react';
import ScenarioComparisonCard from '@/domains/dispatch/components/ScenarioComparisonCard';
import ConfidenceBadge from '@/domains/dispatch/components/ConfidenceBadge';
import type { AIQuoteResponse, GeneratedFile, ChatStructuredPayload } from '@/domains/chat/types';
import QuoteHeroCard from './QuoteHeroCard';

interface ResultSectionProps {
  loading: boolean;
  latestResult: AIQuoteResponse | null;
  onScenarioSelect: (label: string) => void;
  onSend: (message: string) => void;
  onFillInput: (text: string) => void;
  onGenerateFile: (type: GeneratedFile['file_type'], override?: { structured?: ChatStructuredPayload }) => void;
  isGeneratingFile: boolean;
  previewMode: 'input-order' | 'optimized-order';
  setPreviewMode: React.Dispatch<React.SetStateAction<'input-order' | 'optimized-order'>>;
  isPreviewLoading: boolean;
  previewError: string | null;
  onPreviewOnMap: (useSanitizedFallback?: boolean) => void;
  onOpenQuoteDetail: () => void;
}

/** 견적 탭 본문: 결과 카드(최상단) → 시나리오 → 빠른 액션 → 신뢰도 → 운송 정보 → 진행 상태. */
export default function ResultSection({
  loading,
  latestResult,
  onScenarioSelect,
  onSend,
  onFillInput,
  onGenerateFile,
  isGeneratingFile,
  previewMode,
  setPreviewMode,
  isPreviewLoading,
  previewError,
  onPreviewOnMap,
  onOpenQuoteDetail,
}: ResultSectionProps) {
  const destinations = latestResult?.extracted?.destinations;
  const [progressOpen, setProgressOpen] = React.useState(false);
  const allDone = Boolean(latestResult?.extracted && latestResult?.routeSummary && latestResult?.quote);

  if (loading && !latestResult?.quote && !latestResult?.scenarioComparison) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="견적 계산 중">
        <div className="h-3 w-20 rounded bg-muted animate-pulse" />
        <div className="h-28 rounded-2xl bg-muted animate-pulse" />
        <div className="grid grid-cols-2 gap-2">
          <div className="h-12 rounded-lg bg-muted animate-pulse" />
          <div className="h-12 rounded-lg bg-muted animate-pulse" />
        </div>
        <div className="h-20 rounded-xl bg-muted animate-pulse" />
      </div>
    );
  }

  if (!latestResult && !loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/50 px-4 py-10 text-center">
        <Calculator className="w-6 h-6 text-muted-foreground" />
        <div className="text-sm font-semibold text-foreground">아직 견적이 없어요</div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          왼쪽 채팅에 출발지·도착지·차종을 알려주면<br />여기에 견적 결과가 정리돼요.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {latestResult?.quote && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <QuoteHeroCard
            quote={latestResult.quote}
            previewMode={previewMode}
            setPreviewMode={setPreviewMode}
            isPreviewLoading={isPreviewLoading}
            previewError={previewError}
            onPreviewOnMap={onPreviewOnMap}
            onOpenQuoteDetail={onOpenQuoteDetail}
          />
        </div>
      )}

      {latestResult?.scenarioComparison && (
        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="text-xs font-bold text-muted-foreground">시나리오 비교</div>
          <ScenarioComparisonCard
            comparison={latestResult.scenarioComparison}
            routeErrors={latestResult.scenarioRouteErrors}
            onSelect={(r) => onScenarioSelect(r.label)}
          />
        </div>
      )}

      {!loading && (latestResult?.quote || latestResult?.scenarioComparison) && (
        <div className="flex flex-wrap gap-2 animate-in fade-in duration-500">
          <button
            type="button"
            onClick={() => onSend('같은 조건으로 레이와 스타렉스를 모두 비교해줘')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border text-xs font-medium text-foreground hover:border-primary/40 hover:text-primary transition-colors"
          >
            <Truck className="w-3.5 h-3.5" />
            다른 차종으로 비교
          </button>
          <button
            type="button"
            onClick={() => onSend('시간당 요금제와 단건 요금제를 모두 보여줘')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border text-xs font-medium text-foreground hover:border-primary/40 hover:text-primary transition-colors"
          >
            <Calculator className="w-3.5 h-3.5" />
            다른 요금제로 보기
          </button>
          <button
            type="button"
            onClick={() => onGenerateFile('pdf')}
            disabled={isGeneratingFile}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border text-xs font-medium text-foreground hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50"
          >
            {isGeneratingFile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
            PDF 견적서
          </button>
        </div>
      )}

      {!loading && !!latestResult?.scenarioRouteErrors?.length && (
        <div className="rounded-lg border border-warning/30 bg-warning-muted p-3 text-xs text-warning space-y-2 animate-in fade-in duration-500">
          <div className="font-semibold">일부 지점의 좌표를 찾지 못했어요. 정확한 도로명 주소로 다시 시도해 보세요.</div>
          <div className="flex flex-wrap gap-2">
            {latestResult.scenarioRouteErrors.map((e) => (
              <button
                key={e.label}
                type="button"
                onClick={() => onFillInput(`${e.label} 시나리오에서 좌표를 못 찾은 지점의 정확한 도로명 주소를 알려줄게(예: 서울 ○○구 ○○로 12): `)}
                className="px-2.5 py-1 rounded-full border border-warning/40 bg-card text-warning hover:bg-warning-muted transition-colors"
              >
                {e.label} 주소 직접 지정
              </button>
            ))}
          </div>
        </div>
      )}

      {!loading && (latestResult?.confidence || !!latestResult?.assumptions?.length) && (
        <div className="rounded-xl border border-border bg-card p-3 space-y-3 animate-in fade-in duration-500">
          {latestResult?.confidence && <ConfidenceBadge confidence={latestResult.confidence} />}
          {!!latestResult?.assumptions?.length && (
            <div className="space-y-1 border-t border-border pt-2">
              <div className="text-[11px] font-semibold text-muted-foreground">견적 가정·전제</div>
              <ul className="space-y-1">
                {latestResult.assumptions.map((assumption, idx) => (
                  <li key={idx} className="flex gap-1.5 text-[11px] leading-relaxed text-foreground/80">
                    <span className="text-muted-foreground">·</span>
                    <span>{assumption}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {latestResult && (
        <div className="space-y-3">
          <div className="text-xs font-bold text-muted-foreground">운송 정보</div>
          <div className="bg-card rounded-xl border border-border p-4 shadow-sm space-y-4">
            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 text-primary mt-0.5" />
              <div className="w-full min-w-0">
                <div className="text-xs text-muted-foreground mb-0.5">경유지 정보</div>
                <div className="space-y-1.5 mt-1">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded">출발</span>
                    <span className="text-sm font-medium text-foreground truncate">{latestResult?.extracted?.origin?.address || '-'}</span>
                  </div>
                  {destinations?.map((d: { address?: string }, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 relative">
                      <div className="absolute -top-1.5 left-2 w-px h-1.5 bg-border"></div>
                      <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${idx === (destinations.length - 1)
                        ? 'bg-error-muted text-error'
                        : 'bg-primary/10 text-primary'
                        }`}>
                        {idx === (destinations.length - 1) ? '도착' : `경유 ${idx + 1}`}
                      </span>
                      <span className="text-sm font-medium text-foreground truncate">{d.address || '-'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Truck className="w-4 h-4 text-primary mt-0.5" />
              <div>
                <div className="text-xs text-muted-foreground mb-0.5">차량 정보</div>
                <div className="text-sm font-medium text-foreground">{latestResult?.extracted?.vehicleType || '-'}</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock className="w-4 h-4 text-primary mt-0.5" />
              <div>
                <div className="text-xs text-muted-foreground mb-0.5">일정</div>
                <div className="text-sm font-medium text-foreground">
                  {latestResult?.extracted?.departureTime || '-'} 출발 · {latestResult?.extracted?.scheduleType === 'regular' ? '정기' : '비정기'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {latestResult && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setProgressOpen((v) => !v)}
            className="flex w-full items-center gap-1.5 text-xs font-bold text-muted-foreground"
            aria-expanded={allDone ? progressOpen : true}
          >
            진행 상태
            {allDone && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success-muted px-1.5 py-0.5 text-[10px] font-semibold text-success">
                <Check className="w-3 h-3" />
                완료
              </span>
            )}
            {allDone && <ChevronDown className={`w-3.5 h-3.5 transition-transform ${progressOpen ? '' : '-rotate-90'}`} />}
          </button>
          {(!allDone || progressOpen) && (
            <div className="bg-card rounded-xl border border-border p-4 shadow-sm space-y-3">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${latestResult?.extracted ? 'bg-success-500' : 'bg-muted-foreground/30'}`} />
                <span className={`text-sm ${latestResult?.extracted ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>입력 정보 분석</span>
              </div>
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${latestResult?.routeSummary ? 'bg-success-500' : 'bg-muted-foreground/30'}`} />
                <span className={`text-sm ${latestResult?.routeSummary ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>경로 최적화 (Tmap)</span>
              </div>
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${latestResult?.quote ? 'bg-success-500' : 'bg-muted-foreground/30'}`} />
                <span className={`text-sm ${latestResult?.quote ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>최종 견적 산출</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
