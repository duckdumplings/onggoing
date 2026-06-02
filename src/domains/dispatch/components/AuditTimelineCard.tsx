'use client';

import React from 'react';
import { Gauge, AlertTriangle } from 'lucide-react';
import type { AuditTimelineResult, AuditLeg } from '@/domains/chat/types';

interface AuditTimelineCardProps {
  audit: AuditTimelineResult;
}

function minutesLabel(min?: number | null): string {
  if (min == null || Number.isNaN(min)) return '-';
  const v = Math.round(min);
  const h = Math.floor(v / 60);
  const m = v % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

const VERDICT_STYLE: Record<string, { label: string; cls: string }> = {
  tight: { label: '타이트 — 지연 불가피 신호', cls: 'bg-success-100 text-success-700' },
  moderate: { label: '보통 — 일부 여유 가능', cls: 'bg-warning-muted text-warning' },
  loose: { label: '여유 — 단축 여지 가능', cls: 'bg-error-50 text-error-600' },
  unknown: { label: '판정 불가', cls: 'bg-muted text-muted-foreground' },
};

/**
 * 사후 지연 진단 결과 카드(audit_delivery_timeline).
 * - totals 모드: 이론 최소 vs 실측 + 판정 배지
 * - per_stop_timeline 모드: 경유지별 이론주행/실측간격/추정체류 표
 * 수치는 도구 산출물만 사용(여기서 재계산하지 않는다). 토큰·노이모지·tabular.
 */
export default function AuditTimelineCard({ audit }: AuditTimelineCardProps) {
  if (!audit) return null;
  const isTimeline = audit.mode === 'per_stop_timeline' && Array.isArray(audit.legs) && audit.legs.length > 0;
  const verdict = VERDICT_STYLE[audit.verdict ?? 'unknown'] ?? VERDICT_STYLE.unknown;

  return (
    <div className="glass-panel p-4 w-full">
      <div className="flex items-center justify-between mb-1">
        <div className="text-sm font-semibold text-foreground inline-flex items-center gap-1.5">
          <Gauge className="h-4 w-4 text-muted-foreground" />
          지연 진단
        </div>
        {!isTimeline && (
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${verdict.cls}`}>
            {verdict.label}
          </span>
        )}
      </div>

      {!isTimeline ? (
        <>
          {audit.verdictLabel && (
            <div className="mb-3 text-[13px] text-foreground/80 leading-relaxed">{audit.verdictLabel}</div>
          )}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-muted/60 py-2">
              <div className="text-[11px] text-muted-foreground">실측 소요</div>
              <div className="text-sm font-semibold text-foreground tabular-nums">{minutesLabel(audit.actualMinutes)}</div>
            </div>
            <div className="rounded-lg bg-muted/60 py-2">
              <div className="text-[11px] text-muted-foreground">이론 최소</div>
              <div className="text-sm font-semibold text-foreground tabular-nums">{minutesLabel(audit.theoreticalMinMinutes)}</div>
            </div>
            <div className="rounded-lg bg-muted/60 py-2">
              <div className="text-[11px] text-muted-foreground">차이</div>
              <div className="text-sm font-semibold text-foreground tabular-nums">
                {audit.deltaMinutes == null ? '-' : `${audit.deltaMinutes > 0 ? '+' : ''}${audit.deltaMinutes}분`}
              </div>
            </div>
          </div>
          {(audit.km != null || audit.driveMinutes != null) && (
            <div className="mt-2 text-[11px] text-muted-foreground tabular-nums">
              {[
                audit.stopsCount != null ? `${audit.stopsCount}개 지점` : null,
                audit.km != null ? `${audit.km}km` : null,
                audit.driveMinutes != null ? `주행 ${audit.driveMinutes}분` : null,
                audit.dwellMinutes != null ? `체류 ${audit.dwellMinutes}분` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          )}
          {audit.deadlineNote && (
            <div className="mt-2 text-xs text-warning">{audit.deadlineNote}</div>
          )}
        </>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3 font-medium">구간</th>
                  <th className="py-2 px-3 font-medium text-right">이론 주행</th>
                  <th className="py-2 px-3 font-medium text-right">실측 간격</th>
                  <th className="py-2 pl-3 font-medium text-right">추정 체류</th>
                </tr>
              </thead>
              <tbody>
                {(audit.legs ?? []).map((leg: AuditLeg) => (
                  <tr key={leg.seq} className="border-b border-border/60">
                    <td className="py-2 pr-3 text-foreground">
                      <span className="text-[11px] text-muted-foreground tabular-nums">{leg.seq}. </span>
                      <span className="text-foreground/90">{leg.to}</span>
                    </td>
                    <td className="py-2 px-3 text-right text-foreground/80 tabular-nums">{minutesLabel(leg.theoreticalDriveMin)}</td>
                    <td className="py-2 px-3 text-right text-foreground/80 tabular-nums">{minutesLabel(leg.actualIntervalMin)}</td>
                    <td className="py-2 pl-3 text-right font-semibold text-foreground tabular-nums">{minutesLabel(leg.inferredDwellMin)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-muted-foreground">
                  <td className="py-2 pr-3 font-medium">합계</td>
                  <td className="py-2 px-3 text-right tabular-nums">{minutesLabel(audit.theoreticalDriveTotal)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{minutesLabel(audit.actualTotalMin)}</td>
                  <td className="py-2 pl-3 text-right tabular-nums">{minutesLabel(audit.inferredDwellTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground tabular-nums">
            {[
              audit.stopsCount != null ? `${audit.stopsCount}개 지점` : null,
              audit.km != null ? `${audit.km}km` : null,
              audit.avgDriveMinPerLeg != null ? `구간 평균 주행 ${audit.avgDriveMinPerLeg}분` : null,
              audit.avgDwellMinPerStop != null ? `지점 평균 체류 ${audit.avgDwellMinPerStop}분` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </>
      )}

      {Array.isArray(audit.caveats) && audit.caveats.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-border/60 pt-2">
          {audit.caveats.map((c, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
