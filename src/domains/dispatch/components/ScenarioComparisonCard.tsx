'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Map as MapIcon } from 'lucide-react';
import type { ScenarioComparison } from '@/domains/dispatch/services/scenarioComparison';
import type { ScenarioQuoteResult } from '@/domains/dispatch/types/routePlan';
import { summarizeComparison, type SavingsTip } from '@/domains/dispatch/services/scenarioInsights';
import QuoteInsightPanel from './QuoteInsightPanel';

interface ScenarioComparisonCardProps {
  comparison: ScenarioComparison;
  /** 시나리오 라벨 클릭 시(지도/패널 연동 등) 콜백. */
  onSelect?: (result: ScenarioQuoteResult) => void;
  routeErrors?: Array<{ label: string; message: string }>;
  /** 경로 메트릭이 실시간 교통을 반영했는지(신뢰도 신호). */
  realtimeTraffic?: boolean;
  /** 출발 시각(ISO). 펼친 인사이트의 도착 신뢰 구간에 사용. */
  departureAt?: string;
  /** 절감 코치의 CTA(예: 재견적) 클릭 콜백. */
  onApplyTip?: (result: ScenarioQuoteResult, tip: SavingsTip) => void;
}

const won = (v: number) => `₩${Math.round(v).toLocaleString('ko-KR')}`;

function compositionLabel(counts: ScenarioQuoteResult['counts']): string {
  const parts: string[] = [];
  if (counts.pickup) parts.push(`수거 ${counts.pickup}`);
  if (counts.drop) parts.push(`하차 ${counts.drop}`);
  if (counts.return) parts.push(`반납 ${counts.return}`);
  return parts.join(' · ') || `경유 ${counts.totalStops}`;
}

/**
 * 다중 시나리오(3/5/10개 지점) 병렬 비교 결과를 한 표로 보여준다.
 * 추천 근거·추천안 대비 연 절감 바를 노출하고, 행을 펼치면 신뢰 인사이트
 * (운임 분해·절감 코치·신뢰도)를 보여준다. AI 채팅·좌측 패널 공용(presentational).
 */
export default function ScenarioComparisonCard({
  comparison,
  onSelect,
  routeErrors,
  realtimeTraffic,
  departureAt,
  onApplyTip,
}: ScenarioComparisonCardProps) {
  const { results, recommendedLabel } = comparison;
  const [expandedLabel, setExpandedLabel] = useState<string | null>(null);
  if (!results.length) return null;

  const { rationale, annualExtraByLabel, maxAnnualExtra } = summarizeComparison(comparison);
  const errorLabels = new Set((routeErrors ?? []).map((e) => e.label));

  return (
    <div className="glass-panel p-4 w-full">
      <div className="flex items-center justify-between mb-1">
        <div className="text-sm font-semibold text-foreground">시나리오 비교</div>
        {recommendedLabel && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-success-100 text-success-700">
            추천: {recommendedLabel}
          </span>
        )}
      </div>
      {rationale && <div className="mb-3 text-xs text-muted-foreground">{rationale}</div>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="py-2 pr-3 font-medium">시나리오</th>
              <th className="py-2 px-3 font-medium">구성</th>
              <th className="py-2 px-3 font-medium text-right">거리</th>
              <th className="py-2 px-3 font-medium text-right">소요</th>
              <th className="py-2 px-3 font-medium text-right">1회 운임</th>
              <th className="py-2 pl-3 font-medium text-right">연 운임</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => {
              const isRecommended = r.label === recommendedLabel;
              const isExpanded = expandedLabel === r.label;
              const totalMin = r.metrics.driveMinutes + r.metrics.dwellMinutes;
              const extra = annualExtraByLabel[r.label] ?? 0;
              const barPct = maxAnnualExtra > 0 ? Math.round((extra / maxAnnualExtra) * 100) : 0;
              return (
                <React.Fragment key={r.label}>
                  <tr
                    className={`border-b border-border/60 cursor-pointer hover:bg-muted/40 ${
                      isRecommended ? 'bg-success-50/60' : ''
                    }`}
                    onClick={() => setExpandedLabel(isExpanded ? null : r.label)}
                  >
                    <td className="py-2 pr-3 font-medium text-foreground">
                      <span className="inline-flex items-center gap-1">
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        {r.label}
                      </span>
                      <div className="ml-5 text-xs text-muted-foreground">
                        {r.vehicleType} · {r.scheduleType === 'regular' ? '정기' : '비정기'}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-foreground/80">{compositionLabel(r.counts)}</td>
                    <td className="py-2 px-3 text-right text-foreground/80">{r.metrics.km.toFixed(1)}km</td>
                    <td className="py-2 px-3 text-right text-foreground/80">{totalMin}분</td>
                    <td className="py-2 px-3 text-right text-foreground/80">{won(r.oneTimePrice)}</td>
                    <td className="py-2 pl-3 text-right font-semibold text-foreground">
                      {won(r.annualPrice)}
                      {r.frequencyLabel && (
                        <div className="text-xs font-normal text-muted-foreground">{r.frequencyLabel}</div>
                      )}
                      {maxAnnualExtra > 0 && (
                        <div className="mt-1 flex items-center justify-end gap-1.5">
                          <div className="h-1 w-16 overflow-hidden rounded-full bg-muted">
                            <div
                              className={extra === 0 ? 'h-full bg-success-500' : 'h-full bg-warning-400'}
                              style={{ width: extra === 0 ? '100%' : `${barPct}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-normal text-muted-foreground tabular-nums">
                            {extra === 0 ? '최저' : `+${won(extra)}`}
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-b border-border/60">
                      <td colSpan={6} className="bg-muted/20 p-3">
                        <QuoteInsightPanel
                          result={r}
                          confidenceInput={{
                            hasRouteError: errorLabels.has(r.label),
                            realtimeTraffic,
                          }}
                          departureAt={departureAt}
                          onApplyTip={onApplyTip ? (tip) => onApplyTip(r, tip) : undefined}
                        />
                        {onSelect && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelect(r);
                            }}
                            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                          >
                            <MapIcon className="h-3.5 w-3.5" />
                            지도에서 보기
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {routeErrors && routeErrors.length > 0 && (
        <div className="mt-3 text-xs text-warning-700 bg-warning-50 rounded-md p-2">
          {routeErrors.map((e) => (
            <div key={e.label}>
              {e.label}: {e.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
