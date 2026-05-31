'use client';

import React from 'react';
import { Check, X, Clock } from 'lucide-react';
import type { DepartureMatrixResult, DepartureMatrixRow } from '@/domains/chat/types';

interface DepartureMatrixCardProps {
  matrix: DepartureMatrixResult;
}

const won = (v: number) => `₩${Math.round(v).toLocaleString('ko-KR')}`;

function minutesLabel(min?: number): string {
  if (!min || min <= 0) return '-';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

/**
 * 출발시간 × (도착/마감 충족/소요/요금) 매트릭스 카드.
 * compare_departure_times 결과를 마크다운 대신 표로 렌더한다. (.tabular, 토큰, 노이모지)
 */
export default function DepartureMatrixCard({ matrix }: DepartureMatrixCardProps) {
  const rows = matrix.matrix ?? [];
  if (!rows.length) return null;
  const hasDeadline = Boolean(matrix.deadline);

  return (
    <div className="glass-panel p-4 w-full">
      <div className="flex items-center justify-between mb-1">
        <div className="text-sm font-semibold text-foreground inline-flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-muted-foreground" />
          출발시간별 견적
        </div>
        {hasDeadline && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            마감 {matrix.deadline}
          </span>
        )}
      </div>
      {matrix.deadlineNote && (
        <div className="mb-2 text-xs text-muted-foreground">{matrix.deadlineNote}</div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="py-2 pr-3 font-medium">출발</th>
              <th className="py-2 px-3 font-medium text-right">소요</th>
              {hasDeadline && <th className="py-2 px-3 font-medium text-center">도착/마감</th>}
              <th className="py-2 pl-3 font-medium text-right">1회 운임</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row: DepartureMatrixRow) => {
              const isRecommended = row.id === matrix.recommendedId;
              const failed = Boolean(row.error);
              return (
                <tr
                  key={row.id}
                  className={`border-b border-border/60 ${isRecommended ? 'bg-success-50/60' : ''}`}
                >
                  <td className="py-2 pr-3 text-foreground">
                    <div className="font-medium inline-flex items-center gap-1.5">
                      {row.label}
                      {isRecommended && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-success-100 text-success-700">
                          추천
                        </span>
                      )}
                    </div>
                    {(row.dateLabel || row.trafficLabel) && (
                      <div className="text-[11px] text-muted-foreground">
                        {[row.dateLabel, row.trafficLabel].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </td>
                  {failed ? (
                    <td
                      className="py-2 px-3 text-right text-xs text-warning-700"
                      colSpan={hasDeadline ? 3 : 2}
                    >
                      {row.error}
                    </td>
                  ) : (
                    <>
                      <td className="py-2 px-3 text-right text-foreground/80 tabular-nums">
                        {minutesLabel(row.totalMinutes)}
                      </td>
                      {hasDeadline && (
                        <td className="py-2 px-3 text-center tabular-nums">
                          <span className="inline-flex items-center gap-1">
                            {row.meetsDeadline ? (
                              <Check className="h-3.5 w-3.5 text-success-600" />
                            ) : (
                              <X className="h-3.5 w-3.5 text-error-600" />
                            )}
                            <span className="text-foreground/80">{row.arrivalLabel ?? '-'}</span>
                          </span>
                        </td>
                      )}
                      <td className="py-2 pl-3 text-right font-semibold text-foreground tabular-nums">
                        {row.oneTimePrice ? won(row.oneTimePrice) : '-'}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {matrix.basis && (
        <div className="mt-2 text-[11px] text-muted-foreground">{matrix.basis}</div>
      )}
    </div>
  );
}
